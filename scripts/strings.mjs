// Lists the site's own words, from src/text/ and the HTML pages, as Markdown for whoever rewrites them:
// node scripts/strings.mjs [out.md]. Each entry's comment in src/text/ is its context, and holds for the entries after
// it until the next comment; the marks in a comment say in which builds it shows and whether its length is held.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'rolldown/utils';

const root = fileURLToPath(new URL('../', import.meta.url));
const text = path.join(root, 'src/text');

/** The modules in the order a reader meets their words, each with where they show. */
const modules = [
  ['site.ts', 'Every page, the header, the index, errors'],
  ['search.ts', 'The search page'],
  ['document.ts', "A document's page: the strip, the jump buttons, a name's tooltip, line marks"],
  ['popup.ts', 'The popups a name opens, and the inspector, which shows them in the source pane'],
  ['rules.ts', 'Interpreted constraints: rule words, the ¶ mark, the Interpreted section'],
  ['pane.ts', 'The source pane, its inspector, the PDF viewer and the RFC reader'],
  ['wireshark.ts', 'The Wireshark plugin page'],
  ['help.ts', 'The help dialog (?)'],
  ['terms.ts', 'Words several parts share'],
];

const marks = {
  '[self-hosted]': 'self-hosted build only',
  '[public]': 'public build only',
  '[linked]': 'only without SEANCHAI_UNLINKED=1',
  '[unlinked]': 'only with SEANCHAI_UNLINKED=1',
  '[limit]': 'length held by the layout',
};

const cleanComment = comment =>
  comment
    .replace(/^\*+/, '')
    .split('\n')
    .map(line => line.replace(/^\s*\*\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
const marksOf = comment => Object.keys(marks).filter(mark => comment.includes(mark));
const withoutMarks = comment =>
  Object.keys(marks)
    .reduce((said, mark) => said.replaceAll(mark, ''), comment)
    .replace(/\s+/g, ' ')
    .trim();
const cell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');

/** A value as the writer sees it: a text as it is, a function's text with what fills it in braces. */
function shown(source, node) {
  if (node.type === 'Literal') return JSON.stringify(node.value).slice(1, -1).replaceAll('\\"', '"');
  if (node.type === 'TemplateLiteral') return source.slice(node.start + 1, node.end - 1).replace(/\$\{/g, '{');
  if (node.type === 'ArrowFunctionExpression') {
    const params = node.params.map(param => source.slice(param.start, param.end).replace(/:.*$/, '').trim());
    return `(${params.join(', ')}) → ${shown(source, node.body)}`;
  }
  return source.slice(node.start, node.end);
}

function listModule(file) {
  const source = readFileSync(path.join(text, file), 'utf8');
  const { program, comments } = parseSync(file, source);
  // The comment right before a node, with nothing but whitespace between them.
  const before = node => {
    const found = comments.filter(
      comment => comment.end <= node.start && !source.slice(comment.end, node.start).trim(),
    );
    return found.length ? cleanComment(source.slice(found.at(-1).start + 2, found.at(-1).end - 2)) : undefined;
  };
  const sections = [];
  // A comment holds for the exports after it until the next, as for an object's entries.
  let last = '';
  for (const statement of program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : undefined;
    if (!declaration || declaration.type !== 'VariableDeclaration') continue;
    for (const variable of declaration.declarations) {
      const name = variable.id.name;
      const own = before(statement);
      let init = variable.init;
      while (init && (init.type === 'TSAsExpression' || init.type === 'TSSatisfiesExpression')) init = init.expression;
      // An object's comment is its own: what holds for a run of texts does not run on into one.
      const comment = own ?? (init?.type === 'ObjectExpression' ? '' : last);
      last = comment;
      const rows = [];
      const inherited = marksOf(comment);
      const walk = (node, prefix, context) => {
        let current = context;
        for (const property of node.properties) {
          const key = property.key.type === 'Identifier' ? property.key.name : property.key.value;
          const said = before(property);
          if (said !== undefined) current = { text: withoutMarks(said), marks: marksOf(said), fresh: true };
          const full = `${prefix}.${key}`;
          const value = property.value;
          // A rule as the corpus prints it is its syntax, an example the help shows: not words to rewrite.
          if (key === 'printed') continue;
          if (value.type === 'ObjectExpression') walk(value, full, current);
          else {
            rows.push({
              name: full,
              text: shown(source, value),
              context: current?.fresh ? current.text : current?.text ? '″' : '',
              marks: [...new Set([...inherited, ...(current?.marks ?? [])])],
            });
            if (current) current = { ...current, fresh: false };
          }
        }
      };
      if (init?.type === 'ObjectExpression') walk(init, name, undefined);
      // An address is not words: the project's pages are said by the entries naming them.
      else if (init && !(init.type === 'Literal' && /^https?:/.test(init.value)))
        rows.push({
          name,
          text: shown(source, init),
          context: own === undefined ? '″' : withoutMarks(comment),
          marks: inherited,
        });
      const object = init?.type === 'ObjectExpression';
      if (rows.length) sections.push({ name, comment: object ? withoutMarks(comment) : '', rows });
    }
  }
  return sections;
}

const table = rows => [
  '| Name | Text | Context | Shows |',
  '|---|---|---|---|',
  ...rows.map(
    row =>
      `| \`${row.name}\` | ${cell(row.text)} | ${cell(row.context)} | ${row.marks.map(mark => marks[mark]).join('; ')} |`,
  ),
];

const out = [];
let count = 0;
for (const [file, where] of modules) {
  out.push(`## ${where}`, '', `\`src/text/${file}\``, '');
  for (const section of listModule(file)) {
    out.push(`### \`${section.name}\``, '');
    if (section.comment) out.push(section.comment, '');
    out.push(...table(section.rows), '');
    count += section.rows.length;
  }
}

// The list of controls the help shows, which README.md's Mouse and Keyboard tables follow.
const { controlGroups } = await import(path.join(text, 'controls.ts'));
out.push(
  '## The help dialog: the list of controls',
  '',
  "`src/text/controls.ts`, an array the help lists in order; README.md's Mouse and Keyboard tables say the same and change with it. A group's title and note, then each control: what it does, its keys in the context column (key names are not words to rewrite).",
  '',
);
const controls = [];
controlGroups.forEach((group, index) => {
  const self = /PDF pane/.test(group.title) ? ['[self-hosted]'] : [];
  controls.push({
    name: `controlGroups[${index}].title`,
    text: group.title,
    context: "A group's heading",
    marks: self,
  });
  if (group.note)
    controls.push({
      name: `controlGroups[${index}].note`,
      text: group.note,
      context: 'Under the heading, of every control in the group',
      marks: self,
    });
  group.controls.forEach((control, at) =>
    controls.push({
      name: `controlGroups[${index}].controls[${at}].does`,
      text: control.does,
      context: `Keys: ${control.keys.join(', ')}`,
      marks: self,
    }),
  );
});
out.push(...table(controls), '');
count += controls.length;

// The HTML pages' own words, there before any script runs, which no text module holds.
const html = [];
for (const [file, self] of [
  ['index.html', []],
  ['rfc.html', []],
  ['viewer.html', ['[self-hosted]']],
]) {
  const source = readFileSync(path.join(root, file), 'utf8');
  const description = source.match(/name="description"\s+content="([^"]*)"/)?.[1];
  if (description)
    html.push({
      name: `${file} description`,
      text: description,
      context: "The page's description for search engines and link previews",
      marks: self,
    });
  for (const match of source.matchAll(/(title|aria-label)="([^"]*[A-Za-z][^"]*)"/g))
    html.push({
      name: `${file} ${match[1]}`,
      text: match[2],
      context: "A control's tooltip or name for a screen reader",
      marks: self,
    });
  for (const match of source.matchAll(/>\s*([^<>{}]*[A-Za-z][^<>{}]*?)\s*</g)) {
    const words = match[1].replace(/\s+/g, ' ').trim();
    if (!words || /^(Seanchaí)$/.test(words) || /^[−+↑↓]$/.test(words)) continue;
    html.push({
      name: `${file} text`,
      text: words,
      context: /JavaScript/.test(words) ? 'Shown only where scripts do not run' : 'A label in the page',
      marks: self,
    });
  }
}
out.push(
  '## Static pages',
  '',
  "The words of `index.html`, `rfc.html` and `viewer.html` themselves, which the browser shows before any script runs, and the PDF viewer's toolbar. Edit them there.",
  '',
  ...table(html),
  '',
);
count += html.length;

const head = [
  "# The explorer's own words",
  '',
  `Every text of the site's interface that does not come from the corpus: ${count} entries. The words a document, a`,
  'table or a rule of the corpus prints are not here, nor are names, numbers and key names.',
  '',
  'Each entry has its name in the code, its current text, and where it shows. A text in a function form,',
  '`(label) → Loading {label}…`, is filled in where it shows: what goes in braces is said in the context. A context',
  'of ″ is the one above it. The last column says where an entry is not shown in every build:',
  '',
  ...Object.entries(marks).map(([mark, said]) => `- ${said}: \`${mark}\` in the code's comment`),
  '',
  'A rewrite changes the text in `src/text/` (and the HTML pages for their own); `npm test` holds many of the texts',
  'and says which tests to update.',
  '',
];
const markdown = [...head, ...out].join('\n');
const target = process.argv[2];
if (target) writeFileSync(target, markdown);
else process.stdout.write(markdown);
console.error(`${count} entries`);
