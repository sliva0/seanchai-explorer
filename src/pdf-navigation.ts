import type { PDFDocumentProxy, TextContent } from 'pdfjs-dist/types/src/display/api';

export type Outline = NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>;
export interface Destination { pageNumber: number; destArray: unknown[] }

function textLines(items: TextContent['items']) {
  const lines: { y: number; items: { text: string; x: number; height: number }[] }[] = [];
  for (const item of items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const y = item.transform[5];
    let line = lines.find(line => Math.abs(line.y - y) < 2);
    if (!line) { line = { y, items: [] }; lines.push(line); }
    line.items.push({ text: item.str.trim(), x: item.transform[4], height: item.height });
  }
  return lines.map(line => {
    line.items.sort((a, b) => a.x - b.x);
    return { ...line, text: line.items.map(item => item.text).join(' '), top: line.y + Math.max(...line.items.map(item => item.height)) + 10 };
  });
}

const normalizeName = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

export function headingOnPage(items: TextContent['items'], section: string, width: number, name?: string): number | null {
  for (const line of textLines(items)) {
    if ((line.text === section || line.text.startsWith(`${section} `)) && line.items[0].x < width / 4 && !/\.{3}|…/.test(line.text) && (!name || normalizeName(line.text).includes(normalizeName(name)))) {
      return line.top;
    }
  }
  return null;
}

export function rowOnPage(items: TextContent['items'], name: string, width: number): number | null {
  const lines = textLines(items);
  const wanted = normalizeName(name);
  for (let i = 0; i < lines.length; i++) {
    let column = '';
    let text = '';
    for (let j = i; j < Math.min(i + 3, lines.length); j++) {
      if (Math.abs(lines[j].y - lines[i].y) > 40) break;
      column += normalizeName(lines[j].items.filter(item => item.x < width * 0.3).map(item => item.text).join(''));
      text += ` ${lines[j].text}`;
      const matches = column === wanted || (column.startsWith(wanted) && /^\d/.test(column.slice(wanted.length)));
      if (matches && !/\.{3}|…/.test(text) && /(?:\b\d+\b|\b(?:OctetString|UTF8String|Unsigned32|Unsigned64|Enumerated|Grouped)\b)/.test(text)) return lines[i].top;
      if (!wanted.startsWith(column)) break;
    }
  }
  return null;
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
  async function locate(section: string, hint: number, active = () => true, name?: string, row = false): Promise<Destination | null> {
    const key = JSON.stringify([section, name, row, row ? hint : null]);
    if (destinations.has(key)) return destinations.get(key)!;
    const bookmark = row ? undefined : find(await outline, section);
    if (!active()) return null;
    let fallback: Destination | null = null;
    if (bookmark?.dest) {
      const result = await destination(bookmark.dest);
      if (result && (!name || normalizeName(bookmark.title).includes(normalizeName(name)))) { destinations.set(key, result); return result; }
      fallback = result;
    }
    if (fallback) hint = fallback.pageNumber;
    const order = Array.from({ length: pdf.numPages }, (_, i) => i + 1)
      .sort((a, b) => Math.abs(a - hint) - Math.abs(b - hint) || a - b);
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
      const y = row ? (name ? rowOnPage(items, name, width) : null) : headingOnPage(items, section, width, name) ?? (name ? rowOnPage(items, name, width) : null);
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
