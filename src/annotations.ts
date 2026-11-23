import type { DadFile } from './blocks.ts';
import type { Site } from './data.ts';
import { element } from './dom.ts';
import { categoriesOf, categoryWords, elementRowLines, memberMarks } from './elements.ts';
import type { MemberElement } from './elements.ts';

/**
 * What a block type adds to a line of the text beside the grammar's highlighting: classes on the line, and a node laid
 * over the text after its end, which keeps every column.
 */
export interface LineAnnotation {
  classes: string[];
  after?: HTMLElement;
}

/** A block type's annotations of a file's lines, by line index, read from its blocks and the site's indexes. */
type Annotator = (
  file: DadFile,
  document: string,
  site: Site,
) => Map<number, Omit<LineAnnotation, 'classes'> & { class?: string }>;

/**
 * A member's categories in the Information Elements tables describing its command, drawn by CSS from `data-category`,
 * so a copy of the text leaves it.
 */
function categoryMark(elements: MemberElement[]): HTMLElement {
  const mark = element('span', undefined, 'element-mark');
  mark.dataset.category = categoriesOf(elements);
  mark.setAttribute('aria-hidden', 'true');
  mark.title = elements
    .map(({ table, row }) =>
      [
        row.category ? `${row.category}: ${categoryWords[row.category]}` : 'No category',
        row.name,
        table.table ? `table ${table.table}` : table.section,
      ].join(' · '),
    )
    .join('\n');
  return mark;
}

/** Information Elements: a row's line is an `element-row`, and a member a table describes has its category after it. */
const elements: Annotator = (file, document, site) => {
  const lines = new Map<number, { class?: string; after?: HTMLElement }>();
  for (const line of elementRowLines(file)) lines.set(line, { class: 'element-row' });
  for (const [line, found] of memberMarks(file, document, site.elements()))
    if (categoriesOf(found)) lines.set(line, { ...lines.get(line), after: categoryMark(found) });
  return lines;
};

/** Every block type's annotator: a new type that marks its lines adds its own here. */
const annotators: Annotator[] = [elements];

/** What the block types add to a file's lines, by line index. */
export function lineAnnotations(file: DadFile, document: string, site: Site): Map<number, LineAnnotation> {
  const lines = new Map<number, LineAnnotation>();
  for (const annotate of annotators) {
    for (const [line, { class: name, after }] of annotate(file, document, site)) {
      const held = lines.get(line) ?? { classes: [] };
      if (name) held.classes.push(name);
      if (after) held.after = after;
      lines.set(line, held);
    }
  }
  return lines;
}
