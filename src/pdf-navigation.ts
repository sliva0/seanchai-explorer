import type { PDFDocumentProxy, TextContent } from 'pdfjs-dist/types/src/display/api';
import { exactName, looseName, namePattern, normalizeName, rowEvidence, takeName, titleNames } from './table-row.ts';
import type { NameMatch, RowFound } from './table-row.ts';

export type Outline = NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>;
/** `query` is the text to find there when it is not the name asked for, `found` how a row link got there. */
/** What a row knows of its place: `titled` that its section is its own clause, subclauses and all, `value` the number printed beside it. */
export interface RowClue {
  titled?: boolean;
  value?: number;
}
export interface Destination {
  pageNumber: number;
  destArray: unknown[];
  query?: string;
  found?: RowFound;
}

function textLines(items: TextContent['items']) {
  const lines: { y: number; items: { text: string; x: number; end: number; height: number }[] }[] = [];
  for (const item of items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const y = item.transform[5];
    let line = lines.find(line => Math.abs(line.y - y) < 2);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push({
      text: item.str.trim(),
      x: item.transform[4],
      end: item.transform[4] + item.width,
      height: item.height,
    });
  }
  return lines
    .toSorted((a, b) => b.y - a.y)
    .map(line => {
      line.items.sort((a, b) => a.x - b.x);
      return {
        ...line,
        text: line.items.map(item => item.text).join(' '),
        top: line.y + Math.max(...line.items.map(item => item.height)) + 10,
      };
    });
}

/** Items of a line joined where they touch, so a run of text split by a font change stays one table cell. */
function lineCells(items: { text: string; x: number; end: number }[]) {
  const cells: { text: string; x: number; end: number }[] = [];
  for (const item of items) {
    const last = cells.at(-1);
    if (last && item.x - last.end < 3) {
      last.text += `${item.x - last.end > 1 ? ' ' : ''}${item.text}`;
      last.end = Math.max(last.end, item.end);
    } else cells.push({ ...item });
  }
  return cells;
}

export function headingOnPage(
  items: TextContent['items'],
  section: string,
  width: number,
  name?: string,
): number | null {
  for (const line of textLines(items)) {
    if (
      (line.text === section || line.text.startsWith(`${section} `)) &&
      line.items[0].x < width / 4 &&
      !/\.{3}|…/.test(line.text) &&
      (!name || normalizeName(line.text).includes(normalizeName(name)))
    ) {
      return line.top;
    }
  }
  return null;
}

/** A cell's text without what tables add after a name: "Name AVP", "Name (NOTE 3)". */
const nameText = (text: string) => text.replace(/\s*\(NOTE[^)]*\)/gi, '').replace(/\s+AVP$/, '');

/** How far a tall row's cells can sit from the line its name is centred on: a row of six lines, as the descriptions of TS 29.219 make it. */
const tallRow = 6;

/** The row whose first cell reads as `match`, however the cell wraps: the column is found from the name, not from the page. */
function findRow(items: TextContent['items'], match: NameMatch) {
  const lines = textLines(items).map(line => ({ ...line, cells: lineCells(line.items) }));
  for (let i = 0; i < lines.length; i++) {
    const first = lines[i].cells[0];
    // A message format's "[ Name ]" is not a row.
    if (/^[^\p{L}\p{N}]/u.test(first.text)) continue;
    const head = takeName(nameText(first.text), match);
    // A name carrying on with anything but the next column is a sentence. The next column can be one run with it.
    if (!head || (head.rest && !rowEvidence.test(head.rest))) continue;
    const height = lines[i].items[0].height;
    let { column, open, text } = head;
    let evidence = Boolean(head.rest);
    let cell = first;
    let right = first.end;
    let last = i;
    for (let j = i + 1; !match.whole(column) && j < lines.length && lines[last].y - lines[j].y < 2 * height; j++) {
      const next = lines[j].cells.find(next => next.x < cell.end && next.end > cell.x);
      // Other columns' cells, centred in a tall row, can sit on lines between the name's.
      if (!next || !normalizeName(next.text)) continue;
      const part = takeName(nameText(next.text), match, column);
      if (!part || (part.rest && !rowEvidence.test(part.rest))) break;
      ({ column, open } = part);
      text = text.endsWith('-') ? `${text}${part.text}` : `${text} ${part.text}`;
      evidence ||= Boolean(part.rest);
      cell = next;
      right = Math.max(right, next.end);
      last = j;
    }
    // "3GPP-SGSN-" goes on below it: that is 3GPP-SGSN-Address, not 3GPP-SGSN.
    if (!match.whole(column) || open) continue;
    const inColumn = (line: (typeof lines)[number]) =>
      line.cells.some(other => other.x < first.end && other.end > first.x);
    const beside = lines.filter((line, index) => {
      if (line.y < lines[i].y + 2 * height && line.y > lines[last].y - 2 * height) return true;
      // A tall row's other cells can start well above or end well below the name, up to the next cell in its column.
      const between = index < i ? lines.slice(index, i) : lines.slice(last + 1, index + 1);
      return (index < i || index > last) && between.length <= tallRow && !between.some(inColumn);
    });
    // Cells touch where a name fills its column.
    if (evidence || beside.some(line => rowEvidence.test(line.cells.find(other => other.x > right - 3)?.text ?? '')))
      return { top: lines[i].top, text };
  }
  return null;
}

/** A value table's number in the cell before its name: "Bit | Name", "Feature bit | Feature | M/O". */
const valueNumber = /^(?:bit\s*)?\d+$/i;

/**
 * The row whose name stands beside its number: a value table's. Its name can read as a sentence, so a
 * cell is taken whole, and only the number on its left says it is a row. A number on the name's first
 * line goes first, since one centred beside a wrapped name is near the end of another row's name too.
 */
function findValueRow(items: TextContent['items'], match: NameMatch, value?: number) {
  const lines = textLines(items).map(line => ({ ...line, cells: lineCells(line.items) }));
  const pageText = items.map(item => ('str' in item ? item.str : '')).join(' ');
  return valueRowBeside(lines, pageText, match, 0, value) ?? valueRowBeside(lines, pageText, match, 1, value);
}

function valueRowBeside(
  lines: (ReturnType<typeof textLines>[number] & { cells: ReturnType<typeof lineCells> })[],
  pageText: string,
  match: NameMatch,
  reach: number,
  value?: number,
) {
  for (let i = 0; i < lines.length; i++) {
    for (const first of lines[i].cells) {
      let column = normalizeName(nameText(first.text));
      if (!column || !match.starts(column)) continue;
      const height = lines[i].items[0].height;
      let text = first.text;
      let cell = first;
      let last = i;
      for (let j = i + 1; !match.whole(column) && j < lines.length && lines[last].y - lines[j].y < 2 * height; j++) {
        const next = lines[j].cells.find(next => next.x < cell.end && next.end > cell.x);
        if (!next) continue;
        const part = normalizeName(nameText(next.text));
        if (!part || !match.starts(column + part)) break;
        column += part;
        text = `${text}${text.endsWith('-') ? '' : ' '}${next.text}`;
        cell = next;
        last = j;
      }
      if (!match.whole(column)) continue;
      const left = (line: (typeof lines)[number]) =>
        line.cells[0] !== first &&
        line.cells[0].end <= first.x + 3 &&
        valueNumber.test(line.cells[0].text) &&
        (value === undefined || Number(line.cells[0].text.replace(/\D/g, '')) === value);
      // A description beside a wrapped name can come between its lines in the page's text: a find can only match the first.
      const found = last === i || namePattern(text).test(pageText) ? text : first.text;
      if (lines.slice(Math.max(0, i - reach), (reach ? last + reach : i) + 1).some(left))
        return { top: lines[i].top, text: found };
    }
  }
  return null;
}

/** The top of the table row whose first cell is `name`. */
export function rowOnPage(items: TextContent['items'], name: string): number | null {
  return findRow(items, exactName(name))?.top ?? null;
}

/** The top of the value table's row naming `name`, beside the number `value` if said: names repeat among a page's tables, numbers tell them apart. */
export function valueRowOnPage(items: TextContent['items'], name: string, value?: number): number | null {
  return findValueRow(items, exactName(name), value)?.top ?? null;
}

/** The top of the row misprinting `name`, and the name as it is printed. */
export function looseRowOnPage(items: TextContent['items'], name: string) {
  return findRow(items, looseName(name));
}

/** The top of the clause heading named after `name`, wherever its number is. */
export function clauseOnPage(items: TextContent['items'], name: string, width: number): number | null {
  for (const line of textLines(items)) {
    const title = line.text.match(/^[A-Z]?\d+[a-z]*(?:\.\d+[A-Za-z]*)*\.?\s+(.+)$/);
    if (title && line.items[0].x < width / 4 && !/\.{3}|…/.test(line.text) && titleNames(title[1], name))
      return line.top;
  }
  return null;
}

/** The top of a line of a message or AVP format naming `name`: "[ Name ]", "*2{ Name }". */
export function formatOnPage(items: TextContent['items'], name: string): number | null {
  const pattern = namePattern(name);
  for (const line of textLines(items)) {
    if (/^[\d*]*\s*[[<{]/.test(line.text) && pattern.test(line.text)) return line.top;
  }
  return null;
}

/** The top of a line of running text mentioning `name` as a whole word, written with whatever between its parts. */
export function mentionOnPage(items: TextContent['items'], name: string): number | null {
  const pattern = namePattern(name);
  for (const line of textLines(items)) {
    if (!/\.{3}|…/.test(line.text) && pattern.test(line.text)) return line.top;
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
      if (away < distance - 1) {
        distance = away;
        best = index;
      }
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
    const pageNumber =
      typeof ref === 'number' ? ref + 1 : (await pdf.getPageIndex(ref as { num: number; gen: number })) + 1;
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
  /** The page of the first bookmark after `bookmark`, past its subclauses if asked: a section's last page, and the next one's first. */
  async function nextBookmarkPage(bookmark: Outline[number], pastSubclauses = false): Promise<number | null> {
    const flat = (items: Outline): Outline => items.flatMap(item => [item, ...flat(item.items)]);
    const all = flat(await outline);
    for (const item of all.slice(all.indexOf(bookmark) + 1 + (pastSubclauses ? flat(bookmark.items).length : 0))) {
      const next = item.dest && (await destination(item.dest));
      if (next) return next.pageNumber;
    }
    return null;
  }
  function textOf(pageNumber: number) {
    let page = pages.get(pageNumber);
    if (!page) {
      page = pdf.getPage(pageNumber).then(async page => ({
        items: (await page.getTextContent()).items,
        width: page.view[2] - page.view[0],
      }));
      pages.set(pageNumber, page);
    }
    return page;
  }
  /**
   * Where a row link goes: the row in its section's table, under the name or the spelling the source prints,
   * misprinted, a result code's own clause, else the nearest table holding it, the clause named after it,
   * a format naming it, or a mention.
   */
  async function locateRow(
    section: string,
    hint: number,
    active: () => boolean,
    name: string,
    printed?: string,
    clue: RowClue = {},
  ): Promise<Destination | null> {
    const bookmark = find(await outline, section);
    if (!active()) return null;
    const fallback = bookmark?.dest ? await destination(bookmark.dest) : null;
    if (fallback) hint = fallback.pageNumber;
    const pageNumbers = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    // A section's table starts at its heading and stays in the section: the same name in another table comes after it.
    const end = fallback && bookmark ? ((await nextBookmarkPage(bookmark, clue.titled)) ?? pdf.numPages) : pdf.numPages;
    let inSection = fallback
      ? pageNumbers.slice(hint - 1, end)
      : [...pageNumbers.slice(hint - 1), ...pageNumbers.slice(0, hint - 1).toReversed()];
    const everywhere = pageNumbers.toSorted((a, b) => Math.abs(a - hint) - Math.abs(b - hint) || a - b);
    // A line of running text can start with a clause's number too: a heading naming the row comes first.
    const heading = (items: TextContent['items'], width: number) =>
      headingOnPage(items, section, width, name) ?? headingOnPage(items, section, width);
    // A clause can begin under a table listing its AVP: on its heading's page, only what is below the heading is the clause's.
    let clause: { pageNumber: number; top: number } | undefined;
    for (const pageNumber of clue.titled ? (fallback ? [hint] : everywhere) : []) {
      if (!active()) return null;
      const { items, width } = await textOf(pageNumber);
      const top = heading(items, width);
      if (top !== null) {
        clause = { pageNumber, top };
        break;
      }
    }
    // With no bookmarks to end it, the heading's page is all that is known to be the clause.
    if (clause && !fallback) inSection = [clause.pageNumber];
    type Look = (items: TextContent['items'], width: number) => { top: number; text?: string } | null;
    const row =
      (key: string): Look =>
      items => {
        const top = rowOnPage(items, key);
        return top === null ? null : { top, text: key };
      };
    const place =
      (on: (items: TextContent['items'], width: number) => number | null): Look =>
      (items, width) => {
        const top = on(items, width);
        return top === null ? null : { top };
      };
    const { titled, value } = clue;
    const steps: [number[], RowFound, Look][] = [
      ...(value === undefined
        ? []
        : ([
            [inSection, 'row', items => findValueRow(items, exactName(name), value)],
            [inSection, 'row', items => findValueRow(items, exactName(name))],
            [inSection, 'loose', items => findValueRow(items, looseName(name))],
          ] as [number[], RowFound, Look][])),
      [inSection, 'row', row(name)],
      ...(printed ? [[inSection, 'printed', row(printed)] as [number[], RowFound, Look]] : []),
      [inSection, 'loose', items => looseRowOnPage(items, name)],
      // A clause's description table can number its rows, with the name in the second column.
      ...(titled && value === undefined
        ? [[inSection, 'row', items => findValueRow(items, exactName(name))] as [number[], RowFound, Look]]
        : []),
      // A result code's or an AVP's clause is its place: a table elsewhere mapping the code, or listing the AVP, is not.
      ...(titled ? [[inSection, 'clause', place(heading)] as [number[], RowFound, Look]] : []),
      [everywhere, 'other-table', row(name)],
      ...(printed ? [[everywhere, 'other-table', row(printed)] as [number[], RowFound, Look]] : []),
      [everywhere, 'clause', place((items, width) => clauseOnPage(items, name, width))],
      [everywhere, 'format', place(items => formatOnPage(items, name))],
      [everywhere, 'mention', place(items => mentionOnPage(items, name))],
      // A table naming the attribute in a later column: the spelling it prints is only ever a mention.
      ...(printed
        ? [
            [
              everywhere,
              'mention',
              items => {
                const top = mentionOnPage(items, printed);
                return top === null ? null : { top, text: printed };
              },
            ] as [number[], RowFound, Look],
          ]
        : []),
    ];
    for (const [order, found, look] of steps) {
      for (const pageNumber of order) {
        if (!active()) return null;
        const { items, width } = await textOf(pageNumber);
        if (!active()) return null;
        const hit = look(items, width);
        if (
          hit &&
          found !== 'clause' &&
          order === inSection &&
          pageNumber === clause?.pageNumber &&
          hit.top >= clause.top
        )
          continue;
        if (hit)
          return {
            pageNumber,
            destArray: [null, { name: 'XYZ' }, null, hit.top, null],
            found,
            ...(hit.text ? { query: hit.text } : {}),
          };
      }
    }
    return fallback;
  }
  async function locate(
    section: string,
    hint: number,
    active = () => true,
    name?: string,
    row = false,
    printed?: string,
    clue: RowClue = {},
  ): Promise<Destination | null> {
    const key = JSON.stringify([section, name, row, row ? hint : null, printed, clue]);
    if (destinations.has(key)) return destinations.get(key)!;
    if (row && name) {
      const result = await locateRow(section, hint, active, name, printed, clue);
      if (active()) destinations.set(key, result);
      return result;
    }
    const bookmark = find(await outline, section);
    if (!active()) return null;
    let fallback: Destination | null = null;
    if (bookmark?.dest) {
      const result = await destination(bookmark.dest);
      if (result && (!name || normalizeName(bookmark.title).includes(normalizeName(name)))) {
        destinations.set(key, result);
        return result;
      }
      fallback = result;
    }
    if (fallback) hint = fallback.pageNumber;
    const order = Array.from({ length: pdf.numPages }, (_, i) => i + 1).toSorted(
      (a, b) => Math.abs(a - hint) - Math.abs(b - hint) || a - b,
    );
    for (const pageNumber of order) {
      if (!active()) return null;
      const { items, width } = await textOf(pageNumber);
      if (!active()) return null;
      const y = headingOnPage(items, section, width, name) ?? (name ? rowOnPage(items, name) : null);
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
