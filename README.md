# Seanchaí Explorer

A static site over the [Seanchaí](https://github.com/sliva0/seanchai) corpus, live at
<https://sliva0.github.io/seanchai-explorer/>: every Diameter dictionary read from 3GPP
specifications and RFCs as one page, highlighted with the corpus's own TextMate grammar,
with a source pane beside the text showing the document it was read from. AVP and command
names link to their definitions and details, section and page numbers to the source
document, and search covers specifications, AVPs, commands, applications, registry rows,
result codes, bits, features, an integer AVP's named values, information elements and every line of text; a name is also
found by its initials or a misspelling, labelled approximate and listed after the precise
matches. A result lists its documents one a line, and past ten, the first ten with a
toggle for the rest. A command's members carry what its specification's Information
Elements tables say of them, their element and category (M, C or O, and TS 32.299's OM, OC
and dash), with the way from a
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
shown in the browser. Pressing `?` in the site shows the help: the same list of mouse and
keyboard controls and line marks as below, the PDF viewer's keys in a self-hosted build only,
and what interpreted constraints are.

The header's Wireshark page offers Seanchaí's Wireshark plugin, with its links set to the
copy of the site it is downloaded from. Viewed at one of the addresses the build counts as its
own (`SEANCHAI_EXPLORER_URLS`, below), where the served file's line says the first of them, it
offers the file as served, a plain download and one command for every POSIX shell and fish,
a `curl` to a `.part` file beside the plugin and a `mv` over it once whole, so a dropped
connection leaves the plugin as it was; anywhere else it sets this
site's address in the file as its download and install commands fetch it, saying in a sentence
why. It says what a finding's line is, `Severity:
place: problem [source]`, and which expert info field and filter each severity has: an
error `seanchai.violation`, a warning `seanchai.warning`, a note `seanchai.note`, and an
interpreted constraint broken a note too, under `seanchai.interpreted`.

## Mouse

| On a name | |
|---|---|
| Click | its Details or its definition, as "Click goes to" in the document toolbar says (Details unless changed), in the source pane alone, which opens if it was switched off; where the pane cannot show the source, what the name is, in the pane; with "Click shows uses" on, where it is used |
| Alt-click | the same place in the text and the pane; on the Grouped rule a document prints for an AVP it reuses from another, the definition in that document |
| Right-click | where it is used, and every place it is declared but the one opened on, each offering `Jump to`, which moves the text and the pane, and `Show in source`, which moves the pane alone and opens it if hidden: `Definition`, `Reused`, `Rule` and `Details` (see below); for a command, what it is, where else it is printed and its Information Elements tables, each place offering the same two; for a member a table describes, its element, category and row, and for the row its member; for an AVP, the interpreted constraints that hold where it is read, which a click on the ¶ beside its line opens too, and the rules on other AVPs that read it there; for a command, those of its constraints its lines cannot show, as an AVP never sent in it |
| Ctrl-, Shift- or Cmd-click | the browser's |
| `; Section:`, `; Page:` or `; Table:` in a block header | that place in the source document, a `; Table:` its table's caption |
| `; Command-Section:` in an Information Elements or Interpreted Constraints header | the section printing the command the block is about |
| `; Request-Section:` in an Interpreted Constraints header | the section printing the request an answer's rules read |
| a table in a popup or the inspector | the table's block in the text |

| Line marks, after a line's end and left out of a copy | |
|---|---|
| `C`, `OC`, `OM` | a member's category in its command's Information Elements table that its brackets cannot say: C conditional, TS 32.299's OC and OM conditional or mandatory where the operator provisions it; its title names the row stating it, `C, conditional, in TS 29.328 table 6.1.3.1: Service Indication (See 7.4)`, and a click or Enter opens the popup or inspector at that row's line, flashing |
| `M`, `O`, `C`, `-` in a warning's colour | a category its brackets contradict, as an M on `[ ]`, or a member the ABNF holds, not struck out, that the table marks `-`, not used; its title says how, and a click opens the rows stating it |
| `¶` | interpreted constraints hold for the AVP here: its title lists them, and a click or Enter opens them; on a command's `* [ AVP ]` line, those on AVPs only that line admits, each named, which open in the command's popup |

The text is what is being read and the pane only beside it, so a plain click leaves the
text where it is. "Click goes to" is kept in the browser for every document. In a window
too narrow for the pane, it and "Click shows uses" fold under the toolbar's "Click options".

A definition is the row of the first AVP table listing the name, or the clause its link
names where that is another document's or there is no row. Where that row lists the AVP
as another document's, a `Reused AVPs` row's From or a table's Defined-In, it is no
definition: the definition is the clause the From cell links to in the document defining
the AVP, the edition of the release being read where the build holds it, else its newest,
followed on where that document reuses it in turn and stopping where a chain comes back,
and the row is where it is `Reused`. A popup lists every place an AVP is declared, each
one click away, but the one it was opened on: `Definition`, a note saying so where the
build does not hold the defining document; `Reused`; `Rule`, its Grouped AVP rule in this
document, as TS 29.272 prints one in 7.3.194 for Communication-Pattern-Set, reused from TS
29.336; and `Details`. Where the Definition or the Reused row is a row the popup shows for its
flags or From, that row's title says so, `AVP Table 9.2 · RFC 7944 · Definition`, and is the
way there, no place repeating it. Details are the clause that row points to, and are left out where it
points nowhere else; a click then goes to the definition. A reused row's Details are the
clause its name links to in its own document, its From cell keeping its link to the
defining one. An alt-click on the rule of a reused AVP, whose Details it is, goes to the
definition instead, and Back returns to the rule.

A fact a popup states has the way to the place stating it on its own line: the member's
line, which says its brackets and its bold, `Show in source` after `Here:`; an element and
its category, `Element: Wildcarded PSI (See 7.1A) · O, optional`, the document, clause and
table of the row stating it, `TS 29.328 · 6.1.3 · table 6.1.3.1`, a link to that row in
that document's text, loaded as the view goes there and kept on the jump list, then `Show
in source`, one for each table stating it, which the pane opens at that row, found by the AVP in
the table's second column, its match selected; a line gone to in another document moves the pane
to the row or member it is once that document has loaded; a row's flags and From, its table a link to the
row and `Show in source`; a command's application id where its header prints none, the
clause it is from a link. An Information Elements table's rows print no condition: their
Description cell stays in the document, which `Show in source` opens at the table. What
several tables say alike is said once: the row that applies where the name is read comes
first, then this document's, and a row saying all of what a row above it says is not shown,
named under that one, `Also in AVP Table 6.3.0.1 · TS 29.229`; a row giving the same flags
beside cells of its own shows those cells alone, its table named under the first, `Same
flags in AVP Table 7.1.0.1`; flags that differ from those of the first row giving flags are
shown, with how, `Flags differ from AVP Table 6.3.1, which applies here: M not stated in
this table, must not be set in that one`.

A popup says nothing the place it was opened on prints: on a Grouped AVP's rule, no
Contents, which the rule's lines print, and no Rule; on a table's row, its flags in one
line of words with `?` for what its columns mean, rather than its cells again, and not
the row as a place; in a command's own block, neither its AVPs nor its block as its
Definition; in an Interpreted Constraints block, that block's rules in words and element
entry alone, not its scope, rules as printed, quotes or place. Opened anywhere else, those
sections are there. A row of a `Reused AVPs` block with no `; Table:`, an origin a clause's
prose states, is that clause, which is its name's Details.

Where the pane cannot show a document's source, as for a public build's PDFs, it is an
inspector instead: a plain click on a name shows there what its popup would say, its
code, type, flags, members or values, uses, Definition and Details, and opens no popup;
the toolbar's box switching the pane on and off reads `Inspector` there, where it reads
`Source` beside a source the pane shows.
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
which the text colours as the grammar scopes it. TS 32.299's tables name no element, only
the AVPs, each grouped AVP's members set off four spaces a level under its row, and use
TS 32.240's categories too, OM and OC, mandatory or conditional where the operator
provisions it, and a dash, not used. A row set off so is a member of the grouped AVP above
it: its popup says which, `A member of Multiple-Services-Credit-Control › Requested-Service-Unit`,
and goes to that row, `Under`, and its interpreted constraints are those holding within
that AVP. Where a document prints a command more than once under one application, as TS
29.273 does Diameter-EAP-Request for SWa, STa and SWd, the block's `; Command-Section:`
names the clause of the one it describes, a link to it. The tables describing a command are those
the export lists for its block, so where a clause prints a command twice, as TS 29.272's
7.2.9 does IDR for S6a's and S6d's application ids, each block has its own. A member of
the command's `; Type: Message` block that a table names has its popup or inspector name
the element and its category, each with the row stating it, a link to that row. Its line shows the
category only where it says what the brackets do not, laid over the text after its end and
left out of a copy: a C, OC or OM, which no brackets say, and, in a warning's colour with a
title saying how, a category the brackets contradict, an M on `[ ]`, an O, C, OC or OM on
`{ }` or `< >`, or a dash on a member the body holds, which the corpus's linter notes as
`element-optional-in-abnf`, `element-required-in-abnf` and `element-unused-in-abnf`. An M on `{ }` and an O on `[ ]` the brackets say already, so
their lines show none, nor does a row offering one of several AVPs, as `Result-Code` or
`Experimental-Result`. An AVP in a row goes back to the
member, `Member`, which may be in another document: TS 29.328's and TS 29.228's tables
describe TS 29.329's and TS 29.229's commands, and those two documents hold nothing else.
A row naming an AVP the rule lacks says so, as does a table naming no command, and a
command's popup lists its tables and each AVP's category. The section list titles a clause
of tables by the commands they describe, as `Information Elements ULR, ULA`. Search lists
the elements in a section of their own, by their names in the tables, each with its
command, category and AVPs, and its link going to its table's clause.

A `Command Result Codes` block is a procedure's table of the result codes its answer may
carry, "Result-Code AVP value | Condition", each code a name the table prints with no
number, which the export finds in the corpus's result-code tables (TS 29.228 table
6.2.2.1.1, Push-Profile-Answer's). Its `; Command:` and `; Command-Section:` find the
answer as an Information Elements block's do. Each code is a name as a value row's is: a
click finds its row in the source, and its popup says its number and AVP, `Result code 5009
of Experimental-Result-Code · listed for PPA`, and goes to its row in the document defining
it, `Defined in`, which it loads, the one printing the answer, this one or for a Result-Code
value RFC 6733. The answer's popup lists the blocks naming it, `Result codes`, of this
document and of the one printing the answer where it is loaded.

An `Interpreted Constraints` block is what a clause's prose says of an AVP's value or
presence, "encoded as a TBCD-string", "values 0 to 255", "shall be present only if bit X
is set", as a reader read it: each rule follows the sentences it was read from, verbatim.
No document prints it as structure, so the site marks it as interpreted wherever it shows
it, quietly. The blocks stand in the corrected text after the blocks of their clause and
read as the rest of it, in the same font and colours: a quote is a string, a little dimmer
than the rules read from it, wrapped at the pane's edge under its first letter, and a rule
its kind and operands as the grammar scopes them, a long one wrapped at the pane's edge
four characters in past its own indent. Two things mark a block as interpreted: a
thin rule left of its lines, in the hue of the ¶ below, and its `;; interpreted` note.
The note is plain text, whose title says what it cites, the block in the `.dadx` file of
interpreted-constraint blocks it is written in, `(TS29.272.dadx#imei-digits)`: unlike a
correction's `;; corrected`, `;; supplied`, `;; inserted` or `;; deleted`, which opens its
record under the line, what it cites on a line of its own, then why, nothing else printing
it, its record would say only the clause and the quotes the block prints right under it.
The raw text has none.
"Interpreted" in a document toolbar hides them and shows them again, kept in the browser
for every document; a move to a line among them shows them for that page. A block holds
for its AVP wherever the document reads it, within a grouped AVP (`; Within:`), or in a
command (`; Command:`). A member, table row or Information Elements row reading an AVP
that blocks hold for there has a ¶ after its line, a paragraph's mark for a rule read from
prose, beside any category. Its title says where the rules were read from, "From this row's
description:", "From this member's description in table 5.2.2.2.1/1" or "From the prose of
section 7.3.102", then each in words, a text-only one as "cannot be checked on a single
message" and its quote; a click on it, or Enter, opens the AVP's popup, or the inspector where the
pane is one, at them, unfolded and flashing. The popup and the inspector list them in a section of their
own, on a faint tint of the ¶'s hue behind a firmer rule than the text's, folded as Uses is
under a heading counting them and saying what they are, `Interpreted 5  2 on this AVP · 3
reading it`, opened by a click and by nothing kept from one popup to the next; each rule once, in
words, as the text prints it its title; a rule the words cannot say, of a kind or shape the site
does not know, is shown as printed alone ("3 octets", "0 to 255", "always 3", "TBCD-encoded E.164 number",
"present only if DSR-Flags has bit … set", "defaults to FALSE when absent" for a `default`,
"at most one of bits 3, 6 set", "bit 1 set", "bits 4, 5, 6, 7 clear" or "no bits set except 9"
for `bits`, of an unsigned integer or an OctetString's octets read as one big-endian
number, "at least one of A, B present" or "no members present except IMEI, Software-Version"
for `members`, "unique across APN-Configuration instances" for `unique` within one,
"is 1 if Monitoring-Type is 1" for `values`, "holds the same value as the request's User-Name"
for `equals`, "never sent in STR" for `absent`), with its quote, one line ending in an
ellipsis where it is longer, its title the whole sentence, which a click, Enter or Space opens
whole and closes again, and where the pane shows the document a `Source` button sending the
pane to that sentence, as the block's place's `Show in source` does to its first: the PDF
viewer finds its first dozen words, or six, from the clause's heading on through its
subclauses and a page past, compared on letters and digits alone, and selects them; the RFC
reader marks and flashes every line of it, over a page's running footer and header; where the
clause does not print it, each in turn looks in the clause containing it and so on up, as RFC
6733's clause 10 prints the symbol "0" its table 10.1's blocks quote; where it
is not found the clause is the place, with nothing highlighted; and a text-only one, a rule
no checker can run on one message, as a `not checked` tag and its quote. What the
Wireshark plugin makes of a rule is a terse tag at most, its title saying more: `partly
checked` or `not checked` for an element rule it checks so, `needs request` for one reading
the request; the help and the Wireshark page say how checking works. A rule's conditions read as the
grammar joins them, `and` binding tighter than `or`, `not` negating one: "present if
Result-Code is DIAMETER_SUCCESS and TWAN-Connection-Mode has bit “MC-MODE” set", and a
comma before `or` where an alternative joins several. A condition may test an AVP for any of a
list, `Result-Code in DIAMETER_SUCCESS, DIAMETER_MULTI_ROUND_AUTH`, numbers and ranges of
numbers among them, said "is one of DIAMETER_SUCCESS, DIAMETER_MULTI_ROUND_AUTH", a range
"5000 to 5999", and with `not` "is none of"; a title cuts a long one after its first value,
"is one of DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED, … (14 values)", and a popup shows its
first three and `and 11 more`, a button showing the rest. A rule the corpus's formatter
wraps after a comma of such a list goes on in lines indented eight spaces, highlighted,
linked and tinted as its first line is, and said and printed as one line (TS 29.329's
clause 6.2). A name may be a path through grouped
AVPs, `MIP6-Agent-Info/MIP-Home-Agent-Host`, said "MIP-Home-Agent-Host in MIP6-Agent-Info",
and in a block on an answer `request/` names a member of the request it answers, said "the
request's": "present if the request's IDR-Flags has bit “EPS User State Request” set and
Result-Code is DIAMETER_SUCCESS". Every name of a path is a name of its own on the rule's
line, `request` and `/` scoped apart and no names: it links to the member it is, in the
grouped AVP before it, the request or the block's command, and its popup says so, `Here:
member of the request, read by an interpreted rule on EPS-User-State`, with `Member` going
to that line. A value or bit a rule names is the name of its row where the document lists it, in
a value table or its AVP's `Enumerated AVP` block: `3GPP_PS_DATA_OFF_CHANGE`, or in its quotes
`"H(E)NB_LOCAL_IP_ADDRESS_CHANGE"`, a link, a popup and a place in the source as the row's own
name is; one another document defines, as RFC 6733's `DIAMETER_SUCCESS`, is text. A name of
digits only, which the line quotes, `"16"` (TS 29.272's Report-Amount, its value 4), reads
“16” in words, where a number reads 16. A rule reading the request has its `needs request` tag, whose title says the Wireshark plugin
checks it only when the capture holds the request, and its block offers `Request`, the request's
block, where `request_target` and `; Request-Section:` put it. A member of the request, or
of a path's grouped AVP, lists in its popup the rules on other AVPs that read it there,
`rule on EPS-User-State · in IDA`. A block scoped to a command holds in the print its
`; Command-Section:` names, where a document prints the command more than once under one
application (TS 29.273's Diameter-EAP-Answer for STa and SWd), and its `; Command:` links to
that print, or where the document prints the command for several applications and only
`; Application-ID:` tells them apart, as TS 29.212 does CC-Request for Gx, Gxx, Sd and S15,
to that application's. An AVP a command's body
admits only through `* [ AVP ]`, as TS 29.273's session-handling clauses keep
Auth-Session-State out of STa's commands, has no member line to mark: its ¶ is on the
command's `* [ AVP ]` line, its title naming the AVP, "Auth-Session-State: never sent in
DEA", and a click opens the command's popup, which lists, as its inspector does, the blocks
its lines cannot show, those on such an AVP and every `absent` rule of the command. Where
three or more blocks of a command say only that an AVP is never sent there, as RFC 6733's
table 10.1 does of dozens in each of its own commands, they are one line of the ¶'s title,
"never sent in CER: Acct-Interim-Interval, Accounting-Realtime-Required, …", and one of the
popup, its AVPs links to their definitions, the first eight shown and `and 19 more` the
rest, with `From` the first block of each clause they are in; the folded heading counts
them, `Interpreted 27  27 never sent`. A block of a document with one edition, an RFC's,
names no `; Versions:`, and nothing reads it. An `encoding element` rule names another document's
element; where the corpus holds that document, its name links to it, and a `members`
rule's names link to their AVPs as the text's do. Under an element rule, what its layout
means for the value where that is short, "1 to 8 octets", "an integer 0 to 255"; only the
inspector says, under a closed `Checking`, what the corpus's element registry says of it:
what the element is, what the Wireshark plugin checks of it and how far ("full layout",
"partly", "length only", or not checked), what that leaves unchecked and why, and the
documents, editions and clauses its layout was read from, each a link where the corpus
holds it; the ¶'s title says only how far. Each block offers `From`, its clause
in the publisher's copy and `Jump to` the block. An AVP read in a document with no block on it wherever read
shows those of the document its link names, once loaded, as the corpus takes an AVP's from
its origin. The help says what each kind of rule says, as the text prints one, what
each encoding's codec is, and above them, in two short paragraphs, what they are and how far
to trust them, and how the site shows them and the Wireshark plugin checks them, which the
section's "What is this?" opens it at;
[docs/constraints.md](https://github.com/sliva0/seanchai/blob/main/docs/constraints.md)
says more, but the site links to no documentation. Search has no entries of its own for them, as the export
gives none: their lines are found as any line of text is.

## Keyboard

Every move of the text, within a document or to another, keeps the place it leaves on a
list for the tab, which goes back to it to the pixel and survives a reload. A move of the
pane alone is not on the list: the text has not gone anywhere. The arrows left of a
document's title walk the list too, and a browser's Back and Forward step between
documents, the index and search. Where a move lands, the line, or the section of a popup a
mark opened it at, is tinted and outlined: in quickly, held half a second, then fading out
over a second and a half, about two seconds in all, the tint pale enough for all the text on it
to keep its contrast; with reduced motion the tint and outline hold still as long and go at once.

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

| In the PDF viewer, with the focus in it: listed by the help of a self-hosted build only | |
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
Wireshark plugin from PyPI where the build has none. Its plugin links where every build's
does, to the addresses `SEANCHAI_EXPLORER_URLS` gives, else to seanchai's default, the public
site, which only the raw file's one marked line then holds: the page never shows it, nor
names it in a sentence or a command, and its install commands find the line by its pattern;
no chunk of the site spells it, as such a build counts no address its own. The build ends by
checking it, `scripts/check-unlinked.mjs`, and fails if a file of the site's own, outside the
corpus's `data/` and that one line, still names the project.

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
200 MB, into `specifications/` here. A build reads that, else the `specifications/` of
the Seanchaí checkout this repository is inside, which no script here writes: a download
without conversion there would drop the documents the checkout converted.

```sh
npm ci
npm run sources             # download the PDFs, RFC texts and Wireshark's dictionary
npm run build:self-hosted   # the site with its sources, in dist/
npm run preview             # serve dist/
```

A public build uses `specifications/` too if it is there, for Wireshark's AVP names in
search and for the RFC texts, which the browser otherwise fetches from rfc-editor.org.

Every build runs what `seanchai-release.json` pins, through `uvx`, unless told otherwise,
even where this repository is checked out inside a Seanchaí checkout at
`.local/seanchai-explorer`: a site built by the steps above is always the one the pin
names, and a build fails if its export names other versions than the pin. To run another
`seanchai`, say so:

- `SEANCHAI_ROOT` names a Seanchaí checkout to run through `uv run`, its working tree as it
  is: `SEANCHAI_ROOT=../.. npm run build` runs the one this repository is inside;
- `SEANCHAI_ON_PATH=1` runs the `seanchai` command on `PATH`, which needs the `extract`
  extra for `npm run sources`;
- `SEANCHAI_PINNED=1` runs the pin whatever else is set.

Either of the first two writes the export of whatever code it runs, which the site reads
only if it is of the site's schema and in a shape the site knows; a page that cannot read
its data says so.

A plugin passed in `SEANCHAI_PLUGIN` must name the export's `seanchai` and corpus
versions on its `-- seanchai:versions` line, or the build fails.

### The plugin's address

The Wireshark plugin's references link to a copy of this site, the default of its
`seanchai.explorer_url` preference, which a build writes on its one line marked
`-- seanchai:explorer`. `SEANCHAI_EXPLORER_URLS` names the addresses a build is served at,
a JSON array, or one URL alone:

```sh
SEANCHAI_EXPLORER_URLS='["http://abcdef:9001/seanchai", "http://172.28.2.3:9001/seanchai"]' npm run build:self-hosted
```

The first, `http://abcdef:9001/seanchai/`, is the plugin's, which `seanchai wireshark-plugin
--explorer` writes, or the build sets in a plugin `SEANCHAI_PLUGIN` gives; every one is the
site's own, so the Wireshark page viewed at the host's name or straight at its IP offers the
plugin as served, still linking to the first. Each is an http or https URL with no user,
password, query or fragment, nor a double quote, backslash, control character or space,
and is written normal, with a closing slash and without a default port; an address given
twice counts once. Two addresses are one only exactly so: `http:` is not `https:`, nor
`www.host` `host`. A value that is none of this fails the build, saying which entry and why.
Without it, a plugin seanchai makes links to its default, the public site, in every build.

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
  "commit": "21f276e25e05c97a1fd11e64c65cf28420899783"
}
```

The export does not say which commit wrote it, so a build checks its versions and its
schema, not its commit. At the next release of both packages, the pin returns to their
PyPI versions alone: drop `repository` and `commit` and set the two versions.

Then build with the new pin and run the checks. Where the export's schema changed,
regenerate the fixture and types first, as CONTRIBUTING.md's "Generated files" says.

```sh
npm run build               # runs the pin, as every build does by default
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
| `SEANCHAI_ROOT` | A Seanchaí checkout to run through `uv run` instead of the pin, its working tree as it is; `../..` is the one this repository is inside. |
| `SEANCHAI_ON_PATH` | `1` runs the `seanchai` on `PATH` instead of the pin. |
| `SEANCHAI_PINNED` | `1` runs what `seanchai-release.json` pins, whatever else is set; it is the default. |
| `SEANCHAI_SPECIFICATIONS` | The directory `npm run sources` fills and a build reads. Default: `specifications/` here for both; a build reads the one of the checkout `SEANCHAI_ROOT` names or this repository is inside where there is none here. |
| `SEANCHAI_EXPORT` | A prebuilt export to use instead of running `seanchai`. Its mode must match the build's. |
| `SEANCHAI_UNLINKED` | `1` builds a site naming nothing of the open-source project (see "Two build modes"). |
| `SEANCHAI_EXPLORER_URLS` | The addresses the site is served at, as a JSON array or one URL: the first is written into the Wireshark plugin, its links' default, and all count as the site's own (see "The plugin's address"). Default: none, the plugin linking to seanchai's default, the public site. |
| `SEANCHAI_PLUGIN` | A prebuilt Wireshark plugin to ship instead of running `seanchai wireshark-plugin`. Without it, a build from `SEANCHAI_EXPORT` still makes one if a `seanchai` with the command runs, and otherwise ships none. |

## License

[MIT](LICENSE) for this site's code. The specifications remain under their publishers'
terms.
