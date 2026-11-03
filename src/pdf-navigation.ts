import type { PDFDocumentProxy, TextContent } from 'pdfjs-dist/types/src/display/api';
import { normalizeName, rowEvidence } from './table-row.ts';

export type Outline = NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>;
export interface Destination { pageNumber: number; destArray: unknown[] }

function textLines(items: TextContent['items']) {
  const lines: { y: number; items: { text: string; x: number; end: number; height: number }[] }[] = [];
  for (const item of items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const y = item.transform[5];
    let line = lines.find(line => Math.abs(line.y - y) < 2);
    if (!line) { line = { y, items: [] }; lines.push(line); }
    line.items.push({ text: item.str.trim(), x: item.transform[4], end: item.transform[4] + item.width, height: item.height });
  }
  return lines.sort((a, b) => b.y - a.y).map(line => {
    line.items.sort((a, b) => a.x - b.x);
    return { ...line, text: line.items.map(item => item.text).join(' '), top: line.y + Math.max(...line.items.map(item => item.height)) + 10 };
  });
}

/** Items of a line joined where they touch, so a run of text split by a font change stays one table cell. */
function lineCells(items: { text: string; x: number; end: number }[]) {
  const cells: { text: string; x: number; end: number }[] = [];
  for (const item of items) {
    const last = cells.at(-1);
    if (last && item.x - last.end < 3) { last.text += `${item.x - last.end > 1 ? ' ' : ''}${item.text}`; last.end = Math.max(last.end, item.end); }
    else cells.push({ ...item });
  }
  return cells;
}

export function headingOnPage(items: TextContent['items'], section: string, width: number, name?: string): number | null {
  for (const line of textLines(items)) {
    if ((line.text === section || line.text.startsWith(`${section} `)) && line.items[0].x < width / 4 && !/\.{3}|…/.test(line.text) && (!name || normalizeName(line.text).includes(normalizeName(name)))) {
      return line.top;
    }
  }
  return null;
}

/** What follows `wanted` in text holding a name and the next column as one run, or null if it holds no more than a part of the name. */
function joinedRow(text: string, wanted: string): string | null {
  let seen = 0;
  for (let i = 0; i < text.length && seen < wanted.length; i++) {
    const letter = normalizeName(text[i]);
    if (letter && letter !== wanted[seen++]) return null;
    if (seen === wanted.length) return /^\s/.test(text.slice(i + 1)) ? text.slice(i + 1).trim() : null;
  }
  return null;
}

/** The top of the table row whose first cell is `name`, however the cell wraps: the column is found from the name, not from the page. */
export function rowOnPage(items: TextContent['items'], name: string): number | null {
  const lines = textLines(items).map(line => ({ ...line, cells: lineCells(line.items) }));
  const wanted = normalizeName(name);
  for (let i = 0; i < lines.length; i++) {
    const first = lines[i].cells[0];
    // A message format's "[ Name ]" is not a row.
    if (/^[^\p{L}\p{N}]/u.test(first.text)) continue;
    // Some tables write the name as "Name AVP".
    const whole = joinedRow(first.text.replace(/\s+AVP$/, ''), wanted);
    if (whole !== null) { if (rowEvidence.test(whole)) return lines[i].top; continue; }
    let column = normalizeName(first.text.replace(/\s+AVP$/, ''));
    if (!column || !wanted.startsWith(column)) continue;
    const height = lines[i].items[0].height;
    let cell = first;
    let right = first.end;
    let last = i;
    for (let j = i + 1; column !== wanted && j < lines.length && lines[last].y - lines[j].y < 2 * height; j++) {
      const next = lines[j].cells.find(next => next.x < cell.end && next.end > cell.x);
      const text = next && normalizeName(next.text);
      // Other columns' cells, centred in a tall row, can sit on lines between the name's.
      if (!text) continue;
      if (!wanted.startsWith(column + text)) break;
      column += text;
      cell = next;
      right = Math.max(right, next.end);
      last = j;
    }
    // "3GPP-SGSN-" goes on below it: that is 3GPP-SGSN-Address, not 3GPP-SGSN.
    if (column !== wanted || cell.text.endsWith('-')) continue;
    const beside = lines.filter(line => line.y < lines[i].y + 2 * height && line.y > lines[last].y - 2 * height);
    if (beside.some(line => rowEvidence.test(line.cells.find(other => other.x >= right)?.text ?? ''))) return lines[i].top;
  }
  return null;
}

/**
 * Which of a page's find matches lies on the row at `top`. `offsets` are the find controller's: into
 * the page's strings joined with nothing between them, read with `disableNormalization`.
 */
export function matchOnRow(items: TextContent['items'], offsets: number[], top: number): number {
  let position = 0;
  let best = 0;
  let distance = Infinity;
  let index = 0;
  for (const item of items) {
    if (!('str' in item)) continue;
    const end = position + item.str.length;
    for (; index < offsets.length && offsets[index] < end; index++) {
      const away = Math.abs(item.transform[5] + item.height + 10 - top);
      // Within a line of it is a tie, which the first on the line wins: the name, not a mention beside it.
      if (away < distance - 1) { distance = away; best = index; }
    }
    position = end;
  }
  return best;
}

export function createSectionNavigator(pdf: PDFDocumentProxy) {
  const outline = pdf.getOutline().then(items => items ?? []);
  const destinations = new Map<string, Destination | null>();
  const pages = new Map<number, Promise<{ items: TextContent['items']; width: number }>>();
  async function destination(value: string | unknown[]): Promise<Destination | null> {
    const array = typeof value === 'string' ? await pdf.getDestination(value) : value;
    if (!array?.length) return null;
    const ref = array[0];
    const pageNumber = typeof ref === 'number' ? ref + 1 : await pdf.getPageIndex(ref as { num: number; gen: number }) + 1;
    return { pageNumber, destArray: array };
  }
  function find(items: Outline, section: string): Outline[number] | undefined {
    for (const item of items) {
      const title = item.title.replace(/\s+/g, ' ').trim();
      if (title === section || title.startsWith(`${section} `)) return item;
      const child = find(item.items, section);
      if (child) return child;
    }
  }
  /** The page of the first bookmark after `bookmark`: a section's last page, and the next one's first. */
  async function nextBookmarkPage(bookmark: Outline[number]): Promise<number | null> {
    const flat = (items: Outline): Outline => items.flatMap(item => [item, ...flat(item.items)]);
    const all = flat(await outline);
    for (const item of all.slice(all.indexOf(bookmark) + 1)) {
      const next = item.dest && await destination(item.dest);
      if (next) return next.pageNumber;
    }
    return null;
  }
  async function locate(section: string, hint: number, active = () => true, name?: string, row = false): Promise<Destination | null> {
    const key = JSON.stringify([section, name, row, row ? hint : null]);
    if (destinations.has(key)) return destinations.get(key)!;
    const bookmark = find(await outline, section);
    if (!active()) return null;
    let fallback: Destination | null = null;
    if (bookmark?.dest) {
      const result = await destination(bookmark.dest);
      if (result && !row && (!name || normalizeName(bookmark.title).includes(normalizeName(name)))) { destinations.set(key, result); return result; }
      fallback = result;
    }
    if (fallback) hint = fallback.pageNumber;
    const pageNumbers = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    // A section's table starts at its heading and stays in the section: the same name in another table is not its row.
    const end = row && fallback && bookmark ? await nextBookmarkPage(bookmark) ?? pdf.numPages : pdf.numPages;
    const order = !row ? pageNumbers.sort((a, b) => Math.abs(a - hint) - Math.abs(b - hint) || a - b)
      : fallback ? pageNumbers.slice(hint - 1, end)
      : [...pageNumbers.slice(hint - 1), ...pageNumbers.slice(0, hint - 1).reverse()];
    for (const pageNumber of order) {
      if (!active()) return null;
      let page = pages.get(pageNumber);
      if (!page) {
        page = pdf.getPage(pageNumber).then(async page => ({
          items: (await page.getTextContent()).items,
          width: page.view[2] - page.view[0],
        }));
        pages.set(pageNumber, page);
      }
      const { items, width } = await page;
      if (!active()) return null;
      const y = row ? (name ? rowOnPage(items, name) : null) : headingOnPage(items, section, width, name) ?? (name ? rowOnPage(items, name) : null);
      if (y !== null) {
        const result = { pageNumber, destArray: [null, { name: 'XYZ' }, null, y, null] };
        destinations.set(key, result);
        return result;
      }
    }
    destinations.set(key, fallback);
    return fallback;
  }
  return { outline, destination, locate };
}
