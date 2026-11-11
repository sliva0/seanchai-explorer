# Seanchaí explorer

A static site over the [Seanchaí](https://github.com/sliva0/seanchai) corpus, live at
<https://sliva0.github.io/seanchai-explorer/>: every Diameter dictionary read from 3GPP
specifications and RFCs as one page, highlighted with the corpus's own TextMate grammar,
with a source pane beside the text showing the document it was read from. AVP and
command names link to their definitions and details, section and page numbers to the
source document, and search covers specifications, AVPs, commands, applications,
registry rows, result codes, bits, features and every line of text; a name is also
found by its initials or a misspelling, labelled approximate and listed after the
precise matches. It is unofficial and not affiliated with or endorsed by any of the
specifications' publishers. The site holds no Python and reads only what
`seanchai export` writes.

Pressing `?` in the site shows the same list of mouse and keyboard controls as below.

## Mouse

| On a name | |
|---|---|
| Click | its Details or its definition, as "Click goes to" in the document's strip says (Details unless changed), in the source pane alone, which opens if it was switched off; with "Click shows uses" on, where it is used |
| Alt-click | the same place in the text and the pane |
| Right-click | where it is used, with Definition and Details each offering `Jump to`, which moves the text and the pane, and `Show on the right`, which moves the pane alone and opens it if hidden; for a command, what it is and where else it is printed, each place offering the same two |
| Ctrl-, Shift- or Cmd-click | the browser's |

The text is what is being read and the pane only beside it, so a plain click leaves the
text where it is. "Click goes to" is kept in the browser for every document.

A definition is the row of the first AVP table listing the name, or the clause its link
names where that is another document's or there is no row. Details are the clause that
row points to, and are left out where it points nowhere else; a click then goes to the
definition. A row of a `Reused AVPs` block with no `; Table:`, an origin a clause's
prose states, is that clause, which is its name's Details. Where the pane cannot read
the place (a public build's PDFs, a document in no format it reads, a narrow window) a
click does what an alt-click does, and the popup offers only `Jump to`.

A value's name goes to its row the same way, and a `; Section:` or `; Page:` link to its
clause, or with no pane to the publisher's copy in a new tab. A result code's `from`
document goes to the code's row there, and its popup says the code is defined there.

A command is a name too: its name and abbreviation in its `; Type: Message` block, a
Command Codes registry row's two halves, and a per-command column of an AVP table, as TS
32.299's ACR to CCA. Its definition is its block, a registry half's the block of its code
in the document the row cites; it has no Details. Its popup says what its header does
and where its application id comes from, and offers the other half, its registry row,
every other document printing it, and apart from them those printing its name for
another command.

## Keyboard

Every move of the text, within a document or to another, keeps the place it leaves on a
list for the tab, which goes back to it to the pixel and survives a reload. A move of the
pane alone is not on the list: the text has not gone anywhere. The arrows left of a
document's title walk the list too, and a browser's Back and Forward step between
documents, the index and search.

| Keys | Do |
|---|---|
| `Ctrl+O`, `Alt+O`, `[j` | the place before on the jump list |
| `Ctrl+I`, `Alt+I`, `]j` | the place after on the jump list |
| `[d` | the place before on the list in another document |
| `]d` | the place after on the list in another document |
| `Menu`, `Shift+F10` | on a name with the focus, what a right-click does |
| `←`, `→` | on the divider between the panes, widen or narrow the source pane |
| `Escape` | closes a popup, or the help |
| `?` | opens the help |

The keys wait while the focus is in a text box or a list, and a bracket's second key
must come within a second.

| In search | |
|---|---|
| `↑`, `↓` | from result to result, from the search box too |
| `←`, `→` | between the links of one result; in the box they move the caret |

| In the PDF pane (self-hosted), with the focus in it | |
|---|---|
| `Ctrl++`, `Ctrl+-` | zoom in or out, with `=` and `_` too, and Cmd on a Mac |
| `Ctrl+wheel` | zooms at the pointer, as a pinch does |
| `Enter` | in the page box goes to the page, in the find box to the next match |

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

[CONTRIBUTING.md](CONTRIBUTING.md) has the other commands, the tests and the export
contract.

## Environment

| Variable | Meaning |
|---|---|
| `SEANCHAI_ROOT` | A Seanchaí checkout to run instead of the release. |
| `SEANCHAI_SPECIFICATIONS` | The directory `npm run sources` fills and a build reads. Default: `specifications/` in the checkout if there is one, otherwise here. |
| `SEANCHAI_EXPORT` | A prebuilt export to use instead of running `seanchai`. Its mode must match the build's. |

## License

[MIT](LICENSE) for this site's code. The specifications remain under their publishers'
terms.
