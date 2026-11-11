# Seanchaí explorer

A static site over the [Seanchaí](https://github.com/sliva0/seanchai) corpus: every
Diameter dictionary read from 3GPP specifications and RFCs as one page, highlighted
with the corpus's own TextMate grammar. AVP names link to their definitions,
section and page numbers to the source document, and search covers specifications,
AVPs, commands, applications, registry rows, result codes, bits, features and every
line of text.
A name is also found by its initials or a misspelling, labelled approximate and listed
after the precise matches.
The text is what is being read and the source pane only beside it, so a click on a name
shows its definition in the pane and leaves the text where it is. An alt-click moves the
text there too, and a right-click lists where the document uses the name.

It is unofficial and not affiliated with or endorsed by any of the specifications'
publishers. The site holds no Python and reads only what `seanchai export` writes.

## Mouse

| On a name | |
|---|---|
| Click | its definition in the source pane alone, which opens if it was switched off; with the control in the document's strip on, where it is used |
| Alt-click | its definition in the text and the pane |
| Right-click, the menu key | where it is used, with Definition and Details each offering `Jump to`, which moves the text and the pane, and `Show on the right`, which moves the pane alone and opens it if hidden; for a command, what it is and where else it is printed, each place offering the same two |
| Ctrl-, Shift- or Cmd-click | the browser's |

A definition is the row of the first AVP table listing the name, or the clause its link
names where that is another document's or there is no row. Details are the clause that
row points to, and are left out where it points nowhere else. A row of a `Reused AVPs`
block with no `; Table:`, an origin a clause's prose states, is that clause, which is its
name's Details. Where the pane cannot read
the place (a public build's PDFs, a document in no format it reads, a narrow window) a
click does what an alt-click does, and the popup offers only `Jump to`. A value's name
goes to its row the same way, and a `; Section:` or `; Page:` link to its clause, or with
no pane to the publisher's copy in a new tab. A result code's `from` document goes to the
code's row there, and its popup says the code is defined there; search says where most
documents listing a code find it, and which define their own.

A command is a name too: its name and abbreviation in its `; Type: Message` block, a
Command Codes registry row's two halves, and a per-command column of an AVP table, as TS
32.299's ACR to CCA, where the document defines a command of that abbreviation. Its
definition is its block, a registry half's the block of its code in the document the row
cites. It has no Details: a command's block stands in the clause that describes it, and
a procedure clause using it elsewhere is told by no name the corpus records. Its popup says what its header does, the application and where the id
comes from when the header prints none, and offers the other half, its tables, its
registry row, every other document printing it by code, application and half, and apart
from them those printing its name for another command.

## Keyboard

Every move of the text, within a document or to another, keeps the place it leaves on a
list for the tab, which goes back to it to the pixel and survives a reload. A move of the
pane alone is not on the list: the text has not gone anywhere.

| Keys | Go to |
|---|---|
| `Ctrl+O`, `Alt+O`, `[j` | the place before on the list |
| `Ctrl+I`, `Alt+I`, `]j` | the place after on the list |
| `[d` | the place before on the list in another document |
| `]d` | the place after on the list in another document |

The arrows left of a document's title do the same, and a browser's Back and Forward step
between documents, the index and search. The keys wait while the focus is in a text box
or a list, and a bracket's second key must come within a second.

## Two build modes

ETSI's PDF responses forbid framing from another origin (`X-Frame-Options`,
`Content-Security-Policy: frame-ancestors 'self'`) and their CORS header allows only
its own portal, so a page can show ETSI's copy in a side pane only by serving it
from its own origin. Redistributing those PDFs publicly needs ETSI's written
permission. So there are two builds, and the plain one is the safe one:

| | `npm run build` (public) | `npm run build:self-hosted` |
|---|---|---|
| ETSI documents | side pane with a note and a link to ETSI's URL at the page; section links open that URL in a new tab | side pane with a PDF.js viewer |
| RFCs | side pane, from shipped text or rfc-editor.org | side pane |
| Ships PDFs, PDF.js, `viewer.html` | never; the build fails if a PDF is in `dist/` | yes |

Self-hosted output is for an organisation's own use behind its own access control.

## Building

Node 24 or newer with npm, and [uv](https://docs.astral.sh/uv/). Nothing else: the
build runs the released `seanchai` from PyPI through `uvx`.

```sh
npm ci
npm run build               # the public site, in dist/
```

A self-hosted site also ships the source documents, which are downloaded once, about
200 MB, into `specifications/` here:

```sh
npm ci
npm run sources             # download the PDFs, RFC texts and Wireshark's dictionary
npm run build:self-hosted   # the site with its sources, in dist/
npm run preview             # serve dist/
```

A public build uses `specifications/` too if it is there, for Wireshark's AVP names in
search and for the RFC texts, which the browser otherwise fetches from rfc-editor.org.

Which `seanchai` runs is the first of:

1. a Seanchaí checkout, through `uv run`: the one named by `SEANCHAI_ROOT`, or the one
   this repository is inside at `.local/seanchai-explorer`;
2. a `seanchai` command on `PATH`, which needs the `extract` extra for `npm run sources`;
3. the PyPI release, through `uvx`.

## Environment

| Variable | Meaning |
|---|---|
| `SEANCHAI_ROOT` | A Seanchaí checkout to run instead of the release. |
| `SEANCHAI_SPECIFICATIONS` | The directory `npm run sources` fills and a build reads. Default: `specifications/` in the checkout if there is one, otherwise here. |
| `SEANCHAI_EXPORT` | A prebuilt export to use instead of running `seanchai`. Its mode must match the build's. |

## Commands

```sh
npm run dev                 # public mode on 127.0.0.1
npm run dev:self-hosted     # with the PDFs and viewer
npm run build               # public build in dist/
npm run build:self-hosted   # self-hosted build in dist/
npm run preview             # serve dist/
npm run sources             # download the source documents for a self-hosted build
npm run check               # type check

npm test                    # unit tests over tests/fixtures/export; no build, no export
npm run test:build          # one real build per mode, overwrites public/data and dist/
npm run test:smoke          # headless Chromium over a fixture build, and row links over a held PDF and RFC; CHROMIUM=path to choose the browser
```

Run the unit tests through `npm test`, which caps each test process's heap at 1 GB and
its time at two minutes. A failed assertion prints its operands, and printing a DOM node
walks the whole document: without the cap, one failing `assert.equal(node, null)` can
take all the machine's memory. For one file or one test, keep the cap:

```sh
node --max-old-space-size=1024 --test --test-name-pattern='<name>' tests/unit/app.test.mjs
```

In a test, check a node with `absent`, `present`, `same` or `notSame` from
`tests/unit/helpers.mjs`, which compare with `===` and print no node, or compare its text.

`syntax/dad.tmLanguage.json` is a committed copy of the corpus's grammar for an export
that lacks one. A build copies the export's grammar, or else this one, to the generated
`public/syntax/` and never changes this one. `npm run fixture` refreshes it, and the
tests hold it to the exported one.

## The export contract

`src/types.ts`, including `SCHEMA_VERSION`, is generated from the export's
`schema.json`, and the site refuses another schema version before fetching anything
else. `tests/fixtures/export` is five real documents cut from a real public export.
After the export changes:

```sh
npm run data -- --any-schema   # or any public export, passed below
npm run fixture             # node scripts/make-fixture.mjs [export-dir], default public/data
npm run types               # node scripts/generate-types.mjs [schema.json], default the fixture's
npm test
```

`--any-schema` lets through an export of another schema version, which `npm run build`
refuses until the types are regenerated.

Prepare also writes `public/data/commands.json`, which `src/commands.ts` derives from the
export's documents: every command block and Command Codes registry row, about 130 kB,
which a command's popup needs from documents not loaded and which `search.json` holds
only inside 8 MB the document pages never fetch. It comes with the first document, and a
build without it leaves a popup with what the open document says.

## Interface names

The index's second column, the interfaces or application of each document, is not in
the export. `src/interfaces.ts` holds it, curated by hand from each document's scope
clause and table of contents, and search finds a document by them. To add a document, or
change an entry:

- key it by `reference`, or by document `id` where one edition's names differ from the
  others (as TS 29.212's St is not in its Release 11 edition);
- list names as the specification spells them, comma-separated: the Diameter ones, not
  every interface it mentions. For an RFC, name its application;
- give a document with none an empty string, so that it reads as decided. A missing
  entry shows as a blank too, but `npm test` fails on it for the fixture's documents
  and `npm run test:build` for a real export's.

## Deployment

`.github/workflows/pages.yml` deploys to GitHub Pages only when run by hand: it runs
`npm run check` and `npm test`, builds in public mode with the PyPI release, checks no
PDF is in `dist/`, and publishes with the Pages actions. Pages must be set to deploy
from GitHub Actions. `.github/workflows/ci.yml` runs the checks and every test suite on
each push and pull request.

Set the repository variable `SEANCHAI_GIT_REF`, or the `seanchai_git_ref` input of the
run, to build from a ref of `https://github.com/sliva0/seanchai` instead of PyPI.

## License

[MIT](LICENSE) for this site's code. The specifications remain under their publishers'
terms.
