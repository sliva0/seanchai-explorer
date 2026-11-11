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

npm test                    # unit tests over tests/fixtures/export; no build, no export
npm run test:build          # one real build per mode, overwrites public/data and dist/
npm run test:smoke          # headless Chromium over a fixture build, and row links over a held PDF and RFC; CHROMIUM=path to choose the browser
```

## Before every push

Run what CI runs, in the order `.github/workflows/ci.yml` runs it:

```sh
npm ci
npm run check
npm test
npm run test:build
npm run test:smoke
```

CI installs Chromium through `playwright-core` before the smoke tests; locally, set
`CHROMIUM` to a Chromium or Chrome executable if the tests do not find one. Every
command must pass. Fix a failure; do not suppress it, and do not push while any of them
is red. Without `specifications/`, the tests that need it skip, as they do in CI.

## Tests

Run the unit tests through `npm test`, which caps each test process's heap at 1 GB and
its time at two minutes. A failed assertion prints its operands, and printing a DOM node
walks the whole document: without the cap, one failing `assert.equal(node, null)` can
take all the machine's memory. For one file or one test, keep the cap:

```sh
node --max-old-space-size=1024 --test --test-timeout=120000 --test-name-pattern='<name>' tests/unit/app-targets.test.mjs
```

In a test, check a node with `absent`, `present`, `same` or `notSame` from
`tests/unit/helpers.mjs`, which compare with `===` and print no node, or compare its text.
`boot` there starts the site on a happy-dom page over the fixture. The tests booting the
whole site are `tests/unit/app-<area>.test.mjs`, one file per area, since node runs each
file in its own process; the other unit tests cover one module each.

## The export contract

`src/types.ts`, including `SCHEMA_VERSION`, is generated from the export's
`schema.json`, and the site refuses another schema version before fetching anything
else. `tests/fixtures/export` is seven real documents cut from a real public export.

The site reads a document's structure from the export and never from its text: each
file's `blocks` give its rules and their members, its AVP tables and registries row by
row, its value tables, its commands and where its lines name one, all by line index.
`src/blocks.ts` holds what the readers of them share, the block a line is in, a file's
AVP rows by name, one reading per file, and `src/values.ts`, `src/commands.ts`,
`src/avp-facts.ts` and `src/avp-context.ts` make what the page shows of them. The first
reading of a file marks the tokens naming a value or a command, so they link as other
names do. The index of documents gives each one's interfaces, which the index page and
search show beside its title, a blank where it has none or the corpus does not say.

Prepare also writes `public/data/commands.json`, which `src/commands.ts` derives from the
export's documents: every command block and Command Codes registry row, about 130 kB,
which a command's popup needs from documents not loaded and which `search.json` holds
only inside 8 MB the document pages never fetch. It comes with the first document, and a
build without it leaves a popup with what the open document says.

`syntax/dad.tmLanguage.json` is a committed copy of the corpus's grammar for an export
that lacks one. A build copies the export's grammar, or else this one, to the generated
`public/syntax/` and never changes this one.

## Generated files

Refresh them when `seanchai export` changes: `npm run fixture` when what it writes
changes, `npm run types` as well when its `schema.json` does.

```sh
npm run data -- --any-schema   # or any public export, passed below
npm run fixture             # node scripts/make-fixture.mjs [export-dir], default public/data
npm run types               # node scripts/generate-types.mjs [schema.json], default the fixture's
npm test
```

`npm run fixture` rewrites `tests/fixtures/export` and `syntax/dad.tmLanguage.json`, and
the tests hold the copy to the exported grammar. `--any-schema` lets through an export of
another schema version, which `npm run build` refuses until the types are regenerated.
Do not edit `src/types.ts` by hand.

## Source map

| Files in `src/` | Hold |
|---|---|
| `main.ts`, `navigation.ts`, `data.ts`, `storage.ts` | the site's start and routes, the export it fetches, the keys it stores |
| `document-view.ts`, `highlight.ts`, `comments.ts`, `dom.ts` | a document's page: its highlighted text, header and strip |
| `blocks.ts`, `values.ts`, `commands.ts`, `avp-facts.ts`, `avp-context.ts`, `table-row.ts`, `printed-row.ts` | what the export's blocks say of a name, a value or a command |
| `clicks.ts`, `click-target.ts`, `avp-places.ts`, `command-places.ts` | what a click on a name does, and the places it can go |
| `popup.ts`, `avp-popup.ts`, `value-popup.ts`, `command-popup.ts` | the popups and the shell they share |
| `source-pane.ts`, `pdf-navigation.ts` | the pane beside the text and the place it is sent to |
| `jump-list.ts`, `jump-controls.ts`, `positions.ts`, `scroll.ts`, `keys.ts` | the jump list, its keys and buttons, and where each document was left |
| `index-view.ts`, `search.ts`, `fuzzy.ts`, `search-view.ts` | the index page and search |
| `controls.ts`, `help.ts`, `notice.ts`, `theme.ts` | the help dialog and the list of controls it shows, notices, the theme |
| `rfc.ts`, `rfc-text.ts`, `viewer.ts`, `zoom.ts` | the pane's readers: `rfc.html` for RFC text and `viewer.html` for PDFs |
| `types.ts` | generated from the export's schema |

`controls.ts` is the list README.md's Mouse and Keyboard sections follow: change both
together. `scripts/` holds prepare, the sources download, the fixture and type
generators and the public build's check.

## Deployment

Manual only. `.github/workflows/pages.yml` deploys to GitHub Pages when run by hand from
the Actions tab: it runs every check CI runs on the tree being published, builds in public
mode, checks no PDF is in `dist/`, and publishes with the Pages actions. Pages must be set to deploy from
GitHub Actions.

The build runs the PyPI release unless the repository variable `SEANCHAI_GIT_REF`, or
the run's `seanchai_git_ref` input, names a ref of <https://github.com/sliva0/seanchai>,
whose two packages it then installs from that ref.
