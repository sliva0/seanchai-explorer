import type { DadFile } from './blocks.ts';
import { constraintLines, interpretedLines, markTitle } from './constraints.ts';
import type { Site } from './data.ts';
import { element } from './dom.ts';
import { categoriesOf, categoryNote, categoryWords, memberMarks } from './elements.ts';
import type { MemberElement } from './elements.ts';
import { markWords } from './text/document.ts';
import { tableName } from './text/terms.ts';

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
  /** A click on the mark opens what it is about: a mark with such a part is a button. */
  control?: boolean;
}

/** A block type's annotations of a file's lines, by line index, read from its blocks and the site's indexes. */
type Annotator = (file: DadFile, document: string, site: Site) => Map<number, { class?: string; mark?: MarkPart }>;

/**
 * A member's categories in the Information Elements tables describing its command, the mark's letters, and where they
 * contradict its brackets, `element-disagrees`, its title saying how.
 */
const categoryPart = (elements: MemberElement[], disagreements: string[]): MarkPart => ({
  class: disagreements.length ? 'element-mark element-disagrees' : 'element-mark',
  data: { category: categoriesOf(elements) },
  title: [
    ...elements.map(({ table, row }) =>
      [
        row.category
          ? markWords.category(row.category, categoryWords[row.category] ?? row.category)
          : markWords.noCategory,
        row.name,
        table.table ? tableName(table.table) : table.section,
      ]
        .filter(Boolean)
        .join(' · '),
    ),
    ...disagreements,
  ],
});

/**
 * Information Elements: a member a table describes has its category after it where the category says what its
 * brackets do not, a C, TS 32.299's OM, OC or dash, or contradicts them. An M on `{ }` or an O on `[ ]` the brackets say already, so it has none;
 * its popup, the inspector and the tables say every category.
 */
const elements: Annotator = (file, document, site) => {
  const lines = new Map<number, { class?: string; mark?: MarkPart }>();
  for (const [line, { member, elements: found }] of memberMarks(file, document, site.elements())) {
    const note = categoryNote(member, found);
    if (note && categoriesOf(found)) lines.set(line, { mark: categoryPart(found, note.disagreements) });
  }
  return lines;
};

/**
 * Interpreted Constraints: a block's lines are `interpreted`, its quotes `interpreted-quote`, its rules
 * `interpreted-rule`, and the blank lines before
 * it `interpreted-gap`, which hiding the blocks leaves out with them. A line reading an AVP that the corrected file's
 * constraints hold for there has a ¶ in its mark, read from prose, its title where from and the rules in words, and a
 * click on it opens the AVP's popup or inspector at them; `reads` names the AVPs, to find the name on the line.
 */
const constraints: Annotator = (file, document, site) => {
  const lines = new Map<number, { class?: string; mark?: MarkPart }>();
  const classes = {
    interpreted: 'interpreted',
    quote: 'interpreted interpreted-quote',
    rule: 'interpreted interpreted-rule',
    gap: 'interpreted-gap',
  };
  for (const [line, kind] of interpretedLines(file)) lines.set(line, { class: classes[kind] });
  const source = site.held(document) ?? file;
  for (const [line, found] of constraintLines(file, source)) {
    const reads = [...new Set(found.map(item => item.avp))].join(' ');
    lines.set(line, {
      ...lines.get(line),
      mark: {
        class: 'constraint-mark',
        data: { interpreted: String(found.length), reads },
        title: markTitle(file, source, line, found),
        control: true,
      },
    });
  }
  return lines;
};

/** Every block type's annotator: a new type that marks its lines adds its own here. */
const annotators: Annotator[] = [elements, constraints];

/**
 * One mark of a line's parts, laid over the text after its end, its title saying what it means: `aria-hidden`, or a
 * button named by its title where a part opens something.
 */
function markNode(parts: MarkPart[]): HTMLElement {
  const control = parts.some(part => part.control);
  const mark = element(
    control ? 'button' : 'span',
    undefined,
    ['line-mark', ...parts.map(part => part.class)].join(' '),
  );
  for (const part of parts) Object.assign(mark.dataset, part.data);
  mark.title = parts.flatMap(part => part.title).join('\n');
  if (control) {
    (mark as HTMLButtonElement).type = 'button';
    mark.setAttribute('aria-label', mark.title);
  } else mark.setAttribute('aria-hidden', 'true');
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
