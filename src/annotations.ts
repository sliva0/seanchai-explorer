import type { DadFile } from './blocks.ts';
import { blocksSummary, constraintLines, interpretedLines } from './constraints.ts';
import type { Site } from './data.ts';
import { element } from './dom.ts';
import { categoriesOf, categoryWords, elementRowLines, memberMarks } from './elements.ts';
import type { MemberElement } from './elements.ts';

/**
 * What a block type adds to a line of the text beside the grammar's highlighting: classes on the line, and a mark laid
 * over the text after its end, which keeps every column.
 */
export interface LineAnnotation {
  classes: string[];
  after?: HTMLElement;
}

/**
 * A block type's part of a line's mark: a class, the `data-` attributes the stylesheet draws it from, so a copy of the
 * text leaves it, and the lines of its title. A line's parts are one mark, in the order of `annotators`.
 */
interface MarkPart {
  class: string;
  data: Record<string, string>;
  title: string[];
}

/** A block type's annotations of a file's lines, by line index, read from its blocks and the site's indexes. */
type Annotator = (file: DadFile, document: string, site: Site) => Map<number, { class?: string; mark?: MarkPart }>;

/** A member's categories in the Information Elements tables describing its command, the mark's letters. */
const categoryPart = (elements: MemberElement[]): MarkPart => ({
  class: 'element-mark',
  data: { category: categoriesOf(elements) },
  title: elements.map(({ table, row }) =>
    [
      row.category ? `${row.category}: ${categoryWords[row.category]}` : 'No category',
      row.name,
      table.table ? `table ${table.table}` : table.section,
    ].join(' · '),
  ),
});

/** Information Elements: a row's line is an `element-row`, and a member a table describes has its category after it. */
const elements: Annotator = (file, document, site) => {
  const lines = new Map<number, { class?: string; mark?: MarkPart }>();
  for (const line of elementRowLines(file)) lines.set(line, { class: 'element-row' });
  for (const [line, found] of memberMarks(file, document, site.elements()))
    if (categoriesOf(found)) lines.set(line, { ...lines.get(line), mark: categoryPart(found) });
  return lines;
};

/**
 * Interpreted Constraints: a block's lines are `interpreted`, its quotes `constraint-quote`, and the blank lines before
 * it `interpreted-gap`, which hiding the blocks leaves out with them. A line reading an AVP that the corrected file's
 * constraints hold for there has an italic i in its mark, its title the rules in words.
 */
const constraints: Annotator = (file, document, site) => {
  const lines = new Map<number, { class?: string; mark?: MarkPart }>();
  const classes = { interpreted: 'interpreted', quote: 'interpreted constraint-quote', gap: 'interpreted-gap' };
  for (const [line, kind] of interpretedLines(file)) lines.set(line, { class: classes[kind] });
  const source = site.held(document) ?? file;
  for (const [line, found] of constraintLines(file, source)) {
    const rules = blocksSummary(source, found);
    const title = rules.length
      ? `Interpreted: ${rules.join('; ')}`
      : `Interpreted: ${found.length === 1 ? 'a rule' : 'rules'} only its quote says`;
    lines.set(line, {
      ...lines.get(line),
      mark: { class: 'constraint-mark', data: { interpreted: String(found.length) }, title: [title] },
    });
  }
  return lines;
};

/** Every block type's annotator: a new type that marks its lines adds its own here. */
const annotators: Annotator[] = [elements, constraints];

/** One mark of a line's parts, laid over the text after its end, `aria-hidden`: its title says what it means. */
function markNode(parts: MarkPart[]): HTMLElement {
  const mark = element('span', undefined, ['line-mark', ...parts.map(part => part.class)].join(' '));
  for (const part of parts) Object.assign(mark.dataset, part.data);
  mark.setAttribute('aria-hidden', 'true');
  mark.title = parts.flatMap(part => part.title).join('\n');
  return mark;
}

/** What the block types add to a file's lines, by line index. */
export function lineAnnotations(file: DadFile, document: string, site: Site): Map<number, LineAnnotation> {
  const lines = new Map<number, LineAnnotation & { parts: MarkPart[] }>();
  for (const annotate of annotators) {
    for (const [line, { class: name, mark }] of annotate(file, document, site)) {
      const held = lines.get(line) ?? { classes: [], parts: [] };
      if (name) held.classes.push(...name.split(' '));
      if (mark) held.parts.push(mark);
      lines.set(line, held);
    }
  }
  return new Map(
    [...lines].map(([line, { classes, parts }]) => [
      line,
      parts.length ? { classes, after: markNode(parts) } : { classes },
    ]),
  );
}
