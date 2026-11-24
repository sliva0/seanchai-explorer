# Contributing

## Setup

Node 24 or newer with npm, and [uv](https://docs.astral.sh/uv/) for the builds, which run
`seanchai` (see [Building](README.md#building)). Run `npm ci`. The unit tests need
neither uv nor an export: they read `tests/fixtures/export`.

## Commands

```sh
npm run dev                 # public mode on 127.0.0.1
npm run dev:self-hosted     # with the PDFs and viewer
npm run build               # public build in dist/
npm run build:self-hosted   # self-hosted build in dist/
npm run preview             # serve dist/
npm run sources             # download the source documents for a self-hosted build
npm run data                # fill public/ from an export without building
npm run check               # type check
npm run lint                # oxlint over src, scripts, tests and vite.config.ts
npm run format              # oxfmt: format the tree in place
npm run format:check        # oxfmt: fail on a file not formatted

npm test                    # unit tests over tests/fixtures/export; no build, no export
npm run test:build          # one real build per mode, overwrites public/data and dist/
npm run test:smoke          # headless Chromium over a fixture build, and row links over a held PDF and RFC; CHROMIUM=path to choose the browser
```

## Before every push

Run what CI runs, in the order `.github/workflows/ci.yml` runs it:

```sh
npm ci
npm run lint
npm run format:check
npm run check
npm test
npm run test:build
npm run test:smoke
```

Run `npm run format` before committing, so `npm run format:check` passes. `.oxfmtrc.json`
and `.oxlintrc.json` hold the settings, and say what each leaves out and why.

CI installs Chromium through `playwright-core` before the smoke tests; locally, set
`CHROMIUM` to a Chromium or Chrome executable if the tests do not find one. Every
command must pass. Fix a failure; do not suppress it, and do not push while any of them
is red. Without `specifications/`, the tests that need it skip, as they do in CI.

## Tests

Run the unit tests through `npm test`. It runs them under `scripts/guard.mjs`, which kills every test process
once one holds more than 2 GB or the run has taken five minutes (`TEST_MEMORY_MB`, `TEST_TIME_S`), caps each
process's heap at 1 GB and each test at two minutes, and loads `tests/setup.mjs` first. Node caps neither memory
outside the V8 heap nor a loop that never yields, as a component setting its state on every draw does, and either
would otherwise take the machine: a failed assertion prints its operands to a depth of 1000, and printing a DOM node
walks the whole document and window. `tests/setup.mjs` makes a strict comparison over a node fail with each node
named by its tag, id and class instead. For one file or one test, keep both:

```sh
node scripts/guard.mjs node --import ./tests/setup.mjs --max-old-space-size=1024 --test --test-timeout=120000 --test-name-pattern='<name>' tests/unit/app-targets.test.mjs
```

In a test, check a node with `absent`, `present`, `same` or `notSame` from
`tests/unit/helpers.mjs`, which compare with `===` and print no node, or compare its text.
`boot` there starts the site on a happy-dom page over the fixture. The tests booting the
whole site are `tests/unit/app-<area>.test.mjs`, one file per area, since node runs each
file in its own process; the other unit tests cover one module each.

## The export contract

`src/types.ts`, including `SCHEMA_VERSION`, is generated from the export's
`schema.json`. The site reads the versions `src/schema.ts` lists, its own and, while the
pinned release writes it, schema 2 (see "Schema 2" below), and refuses any other before
fetching anything else. `tests/fixtures/export` is nine real documents cut from a real
public export, TS 29.328 among them for its Information Elements tables of TS 29.329's
commands, and TS 29.272 for its Interpreted Constraints blocks. TS 29.272 is the longest,
seconds to draw in the unit tests, so a test file booting it shares one page among its checks.

The site reads a document's structure from the export and never from its text: each
file's `blocks` give its rules and their members, its AVP tables and registries row by
row, its value tables, its commands and where its lines name one, all by line index.
`src/blocks.ts` holds what the readers of them share, the block a line is in, a file's
AVP rows by name, one reading per file, and `src/values.ts`, `src/commands.ts`,
`src/avp-facts.ts` and `src/avp-context.ts` make what the page shows of them. The first
reading of a file marks the tokens naming a value or a command, so they link as other
names do. The index of documents gives each one's interfaces, which the index page and
search show beside its title, a blank where it has none or the corpus does not say.

The export's `commands.json` holds every command block and Command Codes registry row,
about 130 kB, which a command's popup needs from documents not loaded and which
`search.json` holds only inside 8 MB the document pages never fetch. It comes with the
first document, and a build without it leaves a popup with what the open document says.

Prepare writes `public/data/elements.json`, which `src/elements.ts` derives from the
export's documents: for each Message block, every `Information Elements` table its
`described_by` lists, with the table's rows and the lines of the members each row maps to,
about 180 kB and 20 kB compressed. A member's category and row need it where the tables
are another document's (TS 29.328's of TS 29.329's commands), and a row's member where the
rule is: `described_by` says which tables, not what their rows say. It comes with the
first document too, and a build without it shows no categories. A table names its block by
document, clause, name, line and `ordinal`, which of the clause's blocks of that name it
is: TS 29.272's 7.2.9 prints IDR twice, for S6a's and S6d's application ids, each
described by its own table, which matching by name alone gave both. The corrected text and
`commands.json` find a block's tables by its line, a raw view, whose blocks list no
`described_by` and whose lines differ, by its clause, name and ordinal. None of this is
schema 2's: the pinned release's export has no Information Elements blocks, so its
`elements.json` is empty, and nothing of it goes when the pin is bumped.

An `Interpreted Constraints` block, only in a corrected file, has `interpreted`, the AVP
its `; AVP:` names as `name` with `avp_target`, its scope in `fields` (`Within`, or
`Command` with `Application-ID`) and `Versions`, and `readings`, each `quotes` and `rules`
by line. `src/constraints.ts` reads them: which hold where a name is read (unscoped ones
always, a `Within` one as a member of that grouped AVP, a `Command` one in that command's
Message block or Information Elements table), a rule in words, and the lines a hide leaves
out. `ruleKinds` there lists every kind the schema has, each as the text prints one and
what it says, for `ruleWords` and the help, and a test holds it to the schema's list; a
kind the export adds later is said as its line prints it, never refused. An `encoding
element` rule's `document` is a reference, as `TS24.008`, which a popup links to the
corpus's newest edition of (`newestOf` in `src/data.ts`) and leaves as text where it holds
none. A raw view reads them from the corrected document by its blocks' names, as it reads
the element index, and goes to the corrected text for a block. `search.json` has no
entries for them.

### Schema 2

The PyPI release `seanchai-release.json` pins, seanchai 0.2.0, writes schema 2: no
`commands.json`, and a reprinted rule as a `Reprinted AVP` block with `; From:` where
schema 3 has a `Grouped AVP` with `; Reprints:`. Until the pin writes schema 3, prepare
derives `commands.json` itself where the export has none, with `commandIndex` in
`src/commands.ts`, which `tests/unit/commands.test.mjs` holds to what schema 3 exports.
Neither writes Interpreted Constraints blocks, which the site reads only where they are,
so a schema-2 export shows none and no "Interpreted" control, nor Information Elements
blocks, so its `elements.json` is empty and its search has no information elements. The
element index, read from `described_by`, and the raw view's matching by ordinal stay after
the bump. Once the pin is bumped to a release writing schema 3, delete:

- the `2` in `READ_SCHEMAS` in `src/schema.ts`, and the module itself if only
  `SCHEMA_VERSION` is left, as `src/data.ts` and `scripts/prepare.mjs` then compare
  with that again;
- `commandIndex` in `src/commands.ts`, the `commands.json` branch of
  `scripts/prepare.mjs`, and the tests calling it in `tests/unit/commands.test.mjs`;
- `'Reprinted AVP'` in `groupedRules` in `src/avp-context.ts`;
- the schema-2 test at the end of `tests/unit/app-elements.test.mjs`, and the one of
  `tests/build/prepare.test.mjs` deriving a schema-2 export's command index;
- the condition on the schema version around the grammar's check in
  `tests/build/build.test.mjs`, which a schema-2 export's older grammar fails.

Prepare also writes `public/plugin/seanchai_diameter.lua`, the Wireshark plugin, with
`seanchai wireshark-plugin` from the same `seanchai` as the export, or copies `SEANCHAI_PLUGIN`. It ships in both
modes. A build fails if `seanchai` ran for the export and the plugin command failed, saying so where that `seanchai`
is too old to have it; from `SEANCHAI_EXPORT` it goes on without the plugin, and the Wireshark page gives the command
making one instead. The page fetches the file and rewrites its one line ending `-- seanchai:explorer`, through
`src/plugin-file.ts`, to the address it is served at, as its install commands for POSIX shells or fish do with a `sed`
that edits no file in place, which GNU's and BSD's sed spell differently;
it reads the versions from its `-- seanchai:versions` line.
`tests/fixtures/plugin/` holds a few lines standing in for it, which the unit and smoke tests serve.

`syntax/dad.tmLanguage.json` is a committed copy of the corpus's grammar for an export
that lacks one. `src/highlight.ts` runs a grammar's `match` rules and its `begin`/`end`
regions, held on a stack from line to line, as the Information Elements block whose rows
end in a category (`constant.language.category.dad`, which `layout.css` colours, where the
older grammar took an M for an AVP flag); it refuses any other key, as `while`, rather
than match nothing. A build copies the export's grammar, or else this one, to the
generated `public/syntax/` and never changes this one.

## Generated files

Refresh them when `seanchai export` changes: `npm run fixture` when what it writes
changes, `npm run types` as well when its `schema.json` does.

```sh
npm run data -- --any-schema   # or any public export, passed below
npm run fixture             # node scripts/make-fixture.mjs [export-dir], default public/data
npm run types               # node scripts/generate-types.mjs [schema.json], default the fixture's
npm test
```

`npm run fixture` rewrites `tests/fixtures/export`, the export's `commands.json` cut to
its documents, and `syntax/dad.tmLanguage.json`, and the tests hold the copy to the
exported grammar. `--any-schema` lets through an export of
another schema version, which `npm run build` refuses until the types are regenerated.
Do not edit `src/types.ts` by hand.

## Source map

| Files in `src/` | Hold |
|---|---|
| `main.tsx`, `app.tsx`, `render.ts`, `navigation.ts`, `data.ts`, `storage.ts` | the router, the site's component and how it is drawn, its routes, the export it fetches, the keys it stores |
| `document-view.tsx`, `highlight.ts`, `comments.ts`, `dom.ts` | a document's page: its highlighted text, header and strip |
| `blocks.ts`, `values.ts`, `commands.ts`, `elements.ts`, `constraints.ts`, `avp-facts.ts`, `avp-context.ts`, `table-row.ts`, `printed-row.ts` | what the export's blocks say of a name, a value, a command, a command's information elements or an AVP's interpreted constraints |
| `annotations.ts` | what a block type adds to its lines beside the highlighting: a class, and a mark after the text |
| `clicks.ts`, `click-target.ts`, `avp-places.ts`, `command-places.ts`, `element-places.ts` | what a click on a name does, and the places it can go |
| `schema.ts` | the export schemas the site reads |
| `popup/` | the popups: `index.tsx` opens and closes them, `root.tsx` holds what one stands on and has loaded, `avp.tsx`, `command.tsx` and `value.tsx` draw each kind, `constraints.tsx` an AVP's interpreted constraints, `shared.tsx` what they share, `place.ts` where they go by their name |
| `source-pane.tsx`, `pdf-navigation.ts` | the pane beside the text and the place it is sent to, and where it cannot show the source, its inspector of the name last clicked, drawn by the popups' components |
| `jump-list.ts`, `jump-controls.tsx`, `positions.ts`, `scroll.ts`, `keys.ts` | the jump list, its keys and buttons, and where each document was left |
| `index-view.tsx`, `search.ts`, `fuzzy.ts`, `search-view.tsx` | the index page and search |
| `wireshark-view.tsx`, `plugin-file.ts` | the Wireshark plugin's page, and the plugin file it offers and rewrites |
| `controls.ts`, `help.tsx`, `notice.ts`, `theme.ts`, `site-text.ts` | the help dialog and the list of controls it shows, notices, the theme, and the site's few sentences of its own |
| `rfc.ts`, `rfc-text.ts`, `viewer.ts`, `zoom.ts` | the pane's readers: `rfc.html` for RFC text and `viewer.html` for PDFs |
| `types.ts` | generated from the export's schema |

`controls.ts` is the list README.md's Mouse and Keyboard sections follow: change both
together.

### A new block type

A block type is read in one module of its own, as `values.ts`, `commands.ts` and
`elements.ts` are, from the export's `blocks` by line, never from the text. What it
shows plugs in at a few places, each a list or a switch to add to:

- a reader marking the tokens its lines name, run once per file: `readers` in `data.ts`;
- what a line of it adds beside the highlighting: `annotators` in `annotations.ts`, a class
  and a part of the one mark after the line's end, which joins the parts of every type, as
  a member's category and its interpreted constraints' i;
- what a name's line in it is: a kind of `Use` in `avp-context.ts`'s `useAt`, which
  `UseContext` in `popup/avp.tsx` says under "Here:", with the facts and places it
  offers drawn beside `elementFacts`; the inspector draws the same components;
- a clause's title where the export's says only the type: `sectionTitle` in
  `document-view.tsx`;
- an index across documents, where a page needs what another document says: derived in
  `scripts/prepare.mjs`, fetched in `data.ts` beside `elements.json`. `scripts/` holds prepare, the sources download, the fixture and type
generators and the public build's check.

### Components

The site is one [Preact](https://preactjs.com) tree, written in TSX in `.tsx` files for Preact's automatic JSX
runtime. `main.tsx` is the router: it works out from the route what the page shows, draws `<App>` from `app.tsx` with
it, and keeps the jump list, the browser's history and where each document was left. Every page and part of one is a
component with its own state: the index, search, the Wireshark page, the help, the jump buttons, a document's strip and
the source pane, which `source-pane.tsx` holds as a small store its components draw from and the rest of the code
moves. The popups are a second root of their own, which `popup/index.tsx` opens and closes for the text.

What stays imperative does so on purpose, each behind one component or module:

- A document's text, tens of thousands of token nodes, is built once by hand in `document-view.tsx`'s `DocumentText`,
  whose component draws only its empty pane: nothing drawn around it, as the strip's crumb on every scroll, diffs it.
  Its clicks, popups, jumps and positions work on those nodes through the `DocumentView` it gives the router.
- Positions are put back to the pixel by the router once a document is drawn, before anything is waited for.
- The PDF and RFC readers, `viewer.ts` and `rfc.ts`, are pages of their own in the pane's frame, driving PDF.js.
- `notice.ts` is a service any module, the PDF viewer's page too, can tell of a failure.

Drawing is synchronous (`render.ts`): `mount()` has drawn before it returns, and a state update before the handler
making it returns, so the router can position a text it has just drawn and the tests read the page straight after
what they did. An update made while a draw is under way, as from a layout effect, is drawn right after that draw ends,
not inside it. Keep a component's state where it is drawn; what a handler outside the tree must read at the moment of
a click, as the "Click shows uses" box, it reads from the node.

Node strips the types of `src/*.ts` but compiles no JSX, so `npm test` loads `tests/tsx.mjs` through `tests/setup.mjs`, which compiles
a `.tsx` module with oxc as Vite does; run a single test file with `--import ./tests/setup.mjs` too. Code that the scripts import,
as `src/commands.ts` and `src/plugin-file.ts`, stays `.ts` with no JSX.

## Deployment

Manual only. `.github/workflows/pages.yml` deploys to GitHub Pages when run by hand from
the Actions tab: it runs every check CI runs on the tree being published, builds in public
mode, checks no PDF is in `dist/`, and publishes with the Pages actions. Pages must be set to deploy from
GitHub Actions.

The build runs the PyPI release `seanchai-release.json` pins (see README.md, "Bumping the
pinned release"), and fails if the site it built names other versions, unless the
repository variable `SEANCHAI_GIT_REF`, or the run's `seanchai_git_ref` input, names a ref
of <https://github.com/sliva0/seanchai>, whose two packages it then installs from that ref.
The run's summary says which versions it published.
