# Seanchaí explorer

A static site over the [Seanchaí](https://github.com/sliva0/seanchai) corpus, live at
<https://sliva0.github.io/seanchai-explorer/>: every Diameter dictionary read from 3GPP
specifications and RFCs as one page, highlighted with the corpus's own TextMate grammar,
with a source pane beside the text showing the document it was read from. AVP and command
names link to their definitions and details, section and page numbers to the source
document, and search covers specifications, AVPs, commands, applications, registry rows,
result codes, bits, features, information elements and every line of text; a name is also
found by its initials or a misspelling, labelled approximate and listed after the precise
matches. A result lists its documents one a line, and past ten, the first ten with a
toggle for the rest. A command's members carry what its specification's Information
Elements tables say of them, their element and category (M, C or O), with the way from a
member to its row and back, in that document or another. What a clause's prose says of an
AVP's value or presence, as a reader read it, is shown as interpreted constraints: in the
text in the order of the document, and in words where the AVP is read. It is unofficial
and not affiliated with or endorsed by any of the specifications' publishers. The site
holds no Python and reads only what `seanchai export` writes.

The index opens with a search box, which `/` focuses from any page, what the site is, and
one line of what it was built from, its corpus, seanchai and build mode, with links to the
project on GitHub and PyPI. It lists the
documents a publisher at a time, in a tab each, with how many it holds. 3GPP's, or any
publisher's with releases, are a release at a time, in a lighter row of tabs: each release
the corpus holds whole, newest first, and `Older copies`, the copies of older releases held
for what a newer document cites, each with its release and why it is held. A row is
number, version where there are releases, interfaces and title, and a click anywhere on it
opens its document, as a link does: Ctrl or the middle button in a new tab, while a drag
over its text selects it. The tab shown is in the address, `#index/ietf`,
`#index/3gpp/18` or `#index/3gpp/older`, the first publisher's newest release plain `#`,
so a link or Back and Forward come back to it, and the header's Index goes to the tab last
shown in the browser. Pressing `?` in the site shows the same list of mouse and keyboard
controls as below.

The header's Wireshark page offers Seanchaí's Wireshark plugin, with its links set to the
copy of the site it is downloaded from.

## Mouse

| On a name | |
|---|---|
| Click | its Details or its definition, as "Click goes to" in the document's strip says (Details unless changed), in the source pane alone, which opens if it was switched off; where the pane cannot show the source, what the name is, in the pane; with "Click shows uses" on, where it is used |
| Alt-click | the same place in the text and the pane |
| Right-click | where it is used, with Definition and Details each offering `Jump to`, which moves the text and the pane, and `Show on the right`, which moves the pane alone and opens it if hidden; for a command, what it is, where else it is printed and its Information Elements tables, each place offering the same two; for a member a table describes, its element, category and row, and for the row its member; for an AVP, the interpreted constraints that hold where it is read, which a click on the ¶ beside its line opens too |
| Ctrl-, Shift- or Cmd-click | the browser's |

The text is what is being read and the pane only beside it, so a plain click leaves the
text where it is. "Click goes to" is kept in the browser for every document. In a window
too narrow for the pane, it and "Click shows uses" fold under the strip's "Click options".

A definition is the row of the first AVP table listing the name, or the clause its link
names where that is another document's or there is no row. Details are the clause that
row points to, and are left out where it points nowhere else; a click then goes to the
definition. A row of a `Reused AVPs` block with no `; Table:`, an origin a clause's
prose states, is that clause, which is its name's Details.

Where the pane cannot show a document's source, as for a public build's PDFs, it is an
inspector instead: a plain click on a name shows there what its popup would say, its
code, type, flags, members or values, uses, Definition and Details, and opens no popup.
The text stays where it is, and the pane's header links to the publisher's copy at the
page the click would have gone to. A place in a document the pane does read, as an RFC,
it goes to as before. Where there is no pane at all (a document in no format it reads, a
narrow window) a click does what an alt-click does. A popup offers only `Jump to` for a
place the pane cannot show.

A value's name goes to its row the same way, and a `; Section:` or `; Page:` link to its
clause, or with no pane to the publisher's copy in a new tab. A `; Table:` number goes to
its table: a clause can hold several, as TS 29.272's 5A.2.1.1.1 does UVR's and UVA's, so
the PDF pane goes from the block's page to the nearest one printing the table's caption,
`Table 5A.2.1.1.1/2:`, and marks it there, past a sentence naming the table, and the RFC
reader to the table above its `Table 1:` caption; where no caption names it, as a `; Table:`
no RFC table has, to its clause. With no pane it opens the publisher's copy at the block's
page, as a page link does, no better anchor there being. A table a popup or the inspector
names, "Here: an element of ULR · table 5.2.1.1.1/1", the table an interpreted rule was read
from, or a place's "· table 6.1.1.1", links to the block printing that `; Table:` in its
document's text, wherever that is. The document a `; Bases:`,
`; Obsoletes:`, `; Reprints:` or `; From:` line names goes to that document. A result code's `from`
document goes to the code's row there, and its popup says the code is defined there.

A command is a name too: its name and abbreviation in its `; Type: Message` block, a
Command Codes registry row's two halves, and a per-command column of an AVP table, as TS
32.299's ACR to CCA. Its definition is its block, a registry half's the block of its code
in the document the row cites; it has no Details. Its popup says what its header does
and where its application id comes from, and offers the other half, its registry row,
every other document printing it, and apart from them those printing its name for
another command.

An `Information Elements` block is a specification's table of a command's information
elements, the AVP each maps to and its category: M mandatory, C conditional, O optional,
which the text colours as the grammar scopes it. The tables describing a command are those
the export lists for its block, so where a clause prints a command twice, as TS 29.272's
7.2.9 does IDR for S6a's and S6d's application ids, each block has its own. A member of
the command's `; Type: Message` block that a table names has its popup or inspector name
the element and its category and go to the table's row, `Element`. Its line shows the
category only where it says what the brackets do not, laid over the text after its end and
left out of a copy: a C, which no brackets say, and, in a warning's colour with a title
saying how, a category the brackets contradict, an M on `[ ]` or an O or C on `{ }` or
`< >`, which the corpus's linter notes as `element-optional-in-abnf` and
`element-required-in-abnf`. An M on `{ }` and an O on `[ ]` the brackets say already, so
their lines show none, nor does a row offering one of several AVPs, as `Result-Code` or
`Experimental-Result`. An AVP in a row goes back to the
member, `Member`, which may be in another document: TS 29.328's and TS 29.228's tables
describe TS 29.329's and TS 29.229's commands, and those two documents hold nothing else.
A row naming an AVP the rule lacks says so, as does a table naming no command, and a
command's popup lists its tables and each AVP's category. The section list titles a clause
of tables by the commands they describe, as `Information Elements ULR, ULA`. Search lists
the elements in a section of their own, by their names in the tables, each with its
command, category and AVPs, and its link going to its table's clause.

An `Interpreted Constraints` block is what a clause's prose says of an AVP's value or
presence, "encoded as a TBCD-string", "values 0 to 255", "shall be present only if bit X
is set", as a reader read it: each rule follows the sentences it was read from, verbatim.
No document prints it as structure, so the site marks it as interpreted wherever it shows
it, quietly. The blocks stand in the corrected text after the blocks of their clause and
read as the rest of it, in the same font and colours: a quote is a string, a little dimmer
than the rules read from it, wrapped at the pane's edge under its first letter, and a rule
its kind and operands as the grammar scopes them, a long one wrapped at the pane's edge
four characters in past its own indent. Two things mark a block as interpreted: a
thin rule left of its lines, in the hue of the ¶ below, and its `;; interpreted` note,
which opens the declaration's record as a correction's `;; corrected`, `;; supplied`,
`;; inserted` or `;; deleted` does: under the line, which keeps its short note, what the
note cites on a line of its own, then why. The raw text has none.
"Interpreted" in a document's strip hides them and shows them again, kept in the browser
for every document; a move to a line among them shows them for that page. A block holds
for its AVP wherever the document reads it, within a grouped AVP (`; Within:`), or in a
command (`; Command:`). A member, table row or Information Elements row reading an AVP
that blocks hold for there has a ¶ after its line, a paragraph's mark for a rule read from
prose, beside any category. Its title says where the rules were read from, "Read from the
description of this row:", "… of this member's row in table 5.2.2.2.1/1" or "… from clause
7.3.102's text", then each in words, a text-only one as "not checkable from one message"
and its quote; a click on it, or Enter, opens the AVP's popup, or the inspector where the
pane is one, at them, flashing. The popup and the inspector list them, each rule in words
and, under it, as the text prints it ("3 octets", "0 to 255", "TBCD-encoded E.164 number",
"present only if DSR-Flags has bit … set", "read as FALSE when absent" for a `default`,
"at most one of bits 3, 6 set", "bit 1 set", "bits 4, 5, 6, 7 clear" or "no bit set but 9"
for `bits`, of an unsigned integer or an OctetString's octets read as one big-endian
number, "at least one of A, B present" or "no member present but IMEI, Software-Version"
for `members`, "differs from one APN-Configuration to the next" for `unique` within one,
"is 1 if Monitoring-Type is 1" for `values`), with its quote, and a text-only one, a rule
no checker can run on one message, as "Not checkable from one message" and its quote. An `encoding element` rule names another document's
element; where the corpus holds that document, its name links to it, and a `members`
rule's names link to their AVPs as the text's do. Each block offers `Read in`, its clause
in the publisher's copy and `Jump to` the block. An AVP read in a document with no block on it wherever read
shows those of the document its link names, once loaded, as the corpus takes an AVP's from
its origin. The help says what each kind of rule says, as the text prints one, what
each encoding's codec is, and in two sentences how they are read and checked, which the
section's "what these are" opens it at;
[docs/constraints.md](https://github.com/sliva0/seanchai/blob/main/docs/constraints.md)
says more, but the site links to no documentation. Search has no entries of its own for them, as the export
gives none: their lines are found as any line of text is.

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
| `/` | goes to search: its box, from any page |
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
| ETSI documents | side pane as an inspector of the name last clicked, with a link to ETSI's URL at its page; section links open that URL in a new tab | side pane with a PDF.js viewer |
| RFCs | side pane, from shipped text or rfc-editor.org | side pane |
| Ships PDFs, PDF.js, `viewer.html` | never; the build fails if a PDF is in `dist/` | yes |

Self-hosted output is for an organisation's own use behind its own access control.

Either build, with `SEANCHAI_UNLINKED=1` in its environment, names nothing of the
open-source project: no link to it or word of GitHub or PyPI, no introduction of the site
on the index, which keeps its search box, its line of the corpus, seanchai and build mode,
and its hint, no pointer to another build in the source pane, no command generating the
Wireshark plugin from PyPI where the build has none, and a plugin whose links go nowhere
until the Wireshark page sets this site's address in it, as its download and install
commands do. The build ends by checking it, `scripts/check-unlinked.mjs`, and fails if a
file of the site's own, outside the corpus's `data/`, still names the project.

```sh
SEANCHAI_UNLINKED=1 npm run build
SEANCHAI_UNLINKED=1 npm run build:self-hosted
```

## Building

Node 24 or newer with npm, and [uv](https://docs.astral.sh/uv/). Nothing else: the
build runs the `seanchai` and `seanchai-corpus` that `seanchai-release.json` pins, through
`uvx`, so one commit always builds one corpus. The pin is a release on PyPI, or a commit
of [Seanchaí's repository](https://github.com/sliva0/seanchai) while no release writes
the export schema the site reads; the site reads that one schema only, and a build from
an export of any other fails.

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
3. what `seanchai-release.json` pins, through `uvx`. With `SEANCHAI_PINNED=1` it is the
   only one, even inside a checkout. A build that ran it fails if its export names other
   versions than the pin.

A plugin passed in `SEANCHAI_PLUGIN` must name the export's `seanchai` and corpus
versions on its `-- seanchai:versions` line, or the build fails.

### Bumping the pinned release

`seanchai-release.json` names the versions the export must name. With `commit` it also
names a commit of `repository`, whose two packages `uvx` installs from there instead of
PyPI: the released 0.2.0 writes export schema 2, and the site reads schema 3, so until a
release writes it the pin is a commit of the repository, whose packages still call
themselves 0.2.0 and 2026.11.12:

```json
{
  "seanchai": "0.2.0",
  "seanchai-corpus": "2026.11.12",
  "repository": "https://github.com/sliva0/seanchai",
  "commit": "d3fd1b1fd942b6b9e419dbfaad66e52f6dc9cf2b"
}
```

The export does not say which commit wrote it, so a build checks its versions and its
schema, not its commit. At the next release of both packages, the pin returns to their
PyPI versions alone: drop `repository` and `commit` and set the two versions.

Then build with the new pin and run the checks. Where the export's schema changed,
regenerate the fixture and types first, as CONTRIBUTING.md's "Generated files" says.

```sh
SEANCHAI_PINNED=1 npm run build
npm test
```

Commit the file on its own, and run the deploy workflow: it fails if the site it built
is not the pinned release's or not of the schema the site reads, and its summary says
what it published and from where.

[CONTRIBUTING.md](CONTRIBUTING.md) has the other commands, the tests and the export
contract.

## Environment

| Variable | Meaning |
|---|---|
| `SEANCHAI_ROOT` | A Seanchaí checkout to run instead of the pinned one. |
| `SEANCHAI_PINNED` | `1` runs what `seanchai-release.json` pins, even inside a checkout or with a `seanchai` on `PATH`. |
| `SEANCHAI_SPECIFICATIONS` | The directory `npm run sources` fills and a build reads. Default: `specifications/` in the checkout if there is one, otherwise here. |
| `SEANCHAI_EXPORT` | A prebuilt export to use instead of running `seanchai`. Its mode must match the build's. |
| `SEANCHAI_UNLINKED` | `1` builds a site naming nothing of the open-source project (see "Two build modes"). |
| `SEANCHAI_PLUGIN` | A prebuilt Wireshark plugin to ship instead of running `seanchai wireshark-plugin`. Without it, a build from `SEANCHAI_EXPORT` still makes one if a `seanchai` with the command runs, and otherwise ships none. |

## License

[MIT](LICENSE) for this site's code. The specifications remain under their publishers'
terms.
