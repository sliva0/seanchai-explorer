# Seanchaí explorer

A static site over the [Seanchaí](https://github.com/sliva0/seanchai) corpus: every
Diameter dictionary read from 3GPP specifications and RFCs as one page, highlighted
with the corpus's own TextMate grammar. AVP names link to their definitions,
section and page numbers to the source document, and search covers specifications,
AVPs, commands, applications, registry rows, result codes, bits, features and every
line of text.
A name is also found by its initials or a misspelling, labelled approximate and listed
after the precise matches.
Right-clicking a name lists where its document uses it, as does a plain click with the
control in the document's strip on. A click goes to an AVP's Details where it has them
apart from its Definition, and an alt-click always to the Definition.

It is unofficial and not affiliated with or endorsed by any of the specifications'
publishers. The site holds no Python and reads only what `seanchai export` writes.

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

## Prerequisites

Node 24 or newer and npm. An export comes from one of:

- a Seanchaí checkout, used through `uv` with Python 3.14: this repository at
  `.local/seanchai-explorer` inside it, or anywhere with `SEANCHAI_ROOT` set;
- a `seanchai` command on `PATH` (`uv pip install "seanchai[corpus]"`). That export
  is complete except for what needs `seanchai download`: Wireshark's AVP names from
  `specifications/wireshark`, and the RFC texts from `specifications/rfc`, without
  which RFCs are fetched from rfc-editor.org in the browser;
- a directory exported earlier, named by `SEANCHAI_EXPORT`.

## Environment

| Variable | Meaning |
|---|---|
| `SEANCHAI_ROOT` | The Seanchaí checkout to run. Default: `../..` if that is one, otherwise `seanchai` from `PATH`. |
| `SEANCHAI_SPECIFICATIONS` | A `seanchai download` directory. Default: `specifications/` in the checkout. Optional for a public build, in which `--specifications` and `--dictionary` are passed only if the directories exist. |
| `SEANCHAI_EXPORT` | A prebuilt export to use instead of running Python. Its mode must match the build's. |

## Commands

```sh
npm run dev                 # public mode on 127.0.0.1
npm run dev:self-hosted     # with the PDFs and viewer
npm run build               # public build in dist/
npm run build:self-hosted   # self-hosted build in dist/
npm run preview             # serve dist/
npm run check               # type check

npm test                    # unit tests over tests/fixtures/export; no build, no export
npm run test:build          # one real build per mode, overwrites public/data and dist/
npm run test:smoke          # headless Chromium over a fixture build, and row links over a held PDF and RFC; CHROMIUM=path to choose the browser
```

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
npm run prepare:data -- --any-schema   # or any public export, passed below
npm run fixture             # node scripts/make-fixture.mjs [export-dir], default public/data
npm run types               # node scripts/generate-types.mjs [schema.json], default the fixture's
npm test
```

`--any-schema` lets through an export of another schema version, which `npm run build`
refuses until the types are regenerated.

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

`.github/workflows/pages.yml` deploys to GitHub Pages on a push to `main`: it installs
`seanchai[corpus]`, exports, builds in public mode, checks no PDF is in `dist/`, and
publishes with the Pages actions. Pages must be set to deploy from GitHub Actions.

The PyPI install works once the packages are published. Until then the workflow falls
back to installing both workspace packages from
`git+https://github.com/sliva0/seanchai` at `main`. Set the repository variable
`SEANCHAI_GIT_REF`, or the `seanchai_git_ref` input of a manual run, to build from a
given ref instead of PyPI.

## License

[MIT](LICENSE) for this site's code. The specifications remain under their publishers'
terms.
