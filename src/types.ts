// Generated from the export's schema.json by scripts/generate-types.mjs. Do not edit.
export const SCHEMA_VERSION = 2;

export type SeanchaiExport = Index | Search | Document | RawDocument;
/**
 * The closed set of Diameter AVP data types: the basic formats of
 * RFC 6733 §4.2 and the common derived formats of §4.3.1, spelled as the
 * specifications print them.
 *
 * Closed rather than free text because the alternative silently accepts
 * typos: TS 29.272 clause 7.3.83 gives `Alert-Reason` the type "Enumerate",
 * which no reader would defend and nothing else would have caught. A source
 * typo is what the input-patch layer is for.
 *
 * RFC 3588 additionally defined `QoSFilterRule`, which RFC 4005 uses. RFC
 * 6733 later dropped it, but the historical source still needs to round-trip.
 * RFC 6733 §4.3 also lets an application define *new* derived formats, so a
 * specification may eventually print another type that belongs here and is
 * not a mistake. That case has not appeared yet, and it — not convenience —
 * is what would justify opening this set.
 */
export type DataType =
  | 'OctetString'
  | 'Integer32'
  | 'Integer64'
  | 'Unsigned32'
  | 'Unsigned64'
  | 'Float32'
  | 'Float64'
  | 'Grouped'
  | 'Address'
  | 'Time'
  | 'UTF8String'
  | 'DiameterIdentity'
  | 'DiameterURI'
  | 'Enumerated'
  | 'IPFilterRule'
  | 'QoSFilterRule';
/**
 * The code space a registry table allocates, as `; Registry:` writes it.
 *
 * TS 29.230 allocates four: application ids (table 4.1), command codes
 * (5.1/1-5.1/4), the 3GPP vendor's AVP codes (7.1) and its experimental
 * result codes (8.1.2-8.1.4).
 */
export type RegistryKind = 'Application IDs' | 'Command Codes' | 'AVP Codes' | 'Result Codes';
/**
 * What the numbers of a `ValueTable` are, as `; Kind:` writes it.
 */
export type ValueKind = 'result-codes' | 'bits' | 'features';
export type CommandFlag = 'REQ' | 'PXY' | 'ERR';
/**
 * ABNF bracket around an AVP reference inside a message/grouped rule.
 */
export type Presence = 'fixed' | 'required' | 'optional';
export type Severity = 'error' | 'note' | 'accepted';
/**
 * AVP header bits an AVP table's flag-rule columns can name.
 *
 * `P` is RFC 3588's "protected" bit. RFC 6733 deprecated it, but the
 * specifications did not stop printing it — TS 29.061, 29.212, 29.214 and
 * 29.273 all write flags cells like `V, P` — and a file that records what its
 * source document says has to be able to hold it.
 *
 * Declaration order is the canonical spelling order of a flags cell, so `P`
 * goes last: putting it anywhere else would rewrite every committed file for
 * no gain.
 */
export type AvpFlag = 'M' | 'V' | 'P';

/**
 * `index.json`: what the export is and which documents it holds. `generator`
 * marks the directory as an export, which a later export may replace.
 * `corpus_version` is null for a corpus other than the installed one.
 */
export interface Index {
  corpus_version: string | null;
  documents: DocumentSummary[];
  generator: 'seanchai';
  mode: 'public' | 'self-hosted';
  schema_version: number;
  seanchai_version: string | null;
}
/**
 * A document as the index lists it. `path` and `raw` are its files in the
 * export; `raw` is null for a corpus with no raw mirror. `pinned` says why an
 * older release is held. `interfaces` are the Diameter interfaces or
 * reference points it specifies, or an RFC's application, from the corpus's
 * `interfaces.toml`: empty for none, null where the corpus does not say.
 */
export interface DocumentSummary {
  id: string;
  interfaces: string[] | null;
  path: string;
  pinned: string | null;
  publisher: '3GPP' | '3GPP2' | 'ETSI' | 'IETF' | 'OMA' | 'oneM2M';
  raw: string | null;
  reference: string;
  release: number | null;
  source: Source;
  specification: string;
  title: string;
  version: string | null;
}
/**
 * The document a file was read from. `local` and `text` are paths in the
 * export, the PDF of a self-hosted one and an RFC's text, null where absent.
 */
export interface Source {
  kind: 'etsi-pdf' | 'rfc-text' | 'other';
  local: string | null;
  text: string | null;
  url: string | null;
}
/**
 * `search.json`: what only the search page needs.
 */
export interface Search {
  entries: SearchEntry[];
  mentions: Mention[];
  schema_version: number;
}
/**
 * A name as one document means it. `target` is where the name is defined,
 * null for a hole. `defined_in` is the documents defining it, several for a
 * registry row. `abbreviation` is a command's or a registry row's own,
 * `wireshark_name` Wireshark's name for an AVP.
 */
export interface SearchEntry {
  abbreviation: string | null;
  across_releases: CrossRelease | null;
  data_type: DataType | null;
  defined_in: string[];
  document: string;
  identity: AvpIdentity | CommandIdentity | ApplicationIdentity | RegistryIdentity | ValueIdentity | null;
  kind: 'avp' | 'command' | 'application' | 'registry' | 'value';
  name: string;
  target: Target | null;
  wireshark_name: string | null;
}
/**
 * A citation resolved outside the citing document's release, and the rule
 * that allowed it (`corpus.CrossRelease`).
 */
export interface CrossRelease {
  cited: string;
  cited_revision: string | null;
  citing: string;
  meant: string | null;
  revision: string | null;
  rule: string;
  version: string;
}
/**
 * An AVP's identity on the wire.
 */
export interface AvpIdentity {
  code: number;
  kind: 'avp';
  vendor_id: number;
}
/**
 * A command's identity. `application_id` is the effective one: the header's,
 * or for a header printing none the one an Application Scope block covering
 * its clause states, named in `application`. `header_application_id` is what
 * the header prints, null for a bare one.
 */
export interface CommandIdentity {
  application: string | null;
  application_id: number | null;
  command_code: number;
  header_application_id: number | null;
  kind: 'command';
}
/**
 * An application a document names in an Application Scope block.
 */
export interface ApplicationIdentity {
  application_id: number;
  kind: 'application';
}
/**
 * A row of a registry table, by the code space it allocates in.
 */
export interface RegistryIdentity {
  code: number;
  kind: 'registry';
  registry: RegistryKind;
}
/**
 * A name a value table gives a number: `value_kind` says of which sort, and
 * `avp` of which AVP; a feature's `application` and `feature_list_id` say which
 * list, as the table's caption does.
 */
export interface ValueIdentity {
  application: string | null;
  avp: string;
  feature_list_id: number | null;
  kind: 'value';
  value: number;
  value_kind: ValueKind;
}
/**
 * Where a link goes: a document's page, at a clause when `section` is set.
 * `name` is the AVP a re-used row's origin cell links to there, or the value
 * a result code's origin links to.
 */
export interface Target {
  document: string;
  name?: string | null;
  section?: string | null;
}
/**
 * A non-blank line of a corrected file, with the AVPs it names.
 */
export interface Mention {
  avps: string[];
  document: string;
  line: number;
  section: string | null;
  text: string;
}
/**
 * `documents/<id>.json`: one corrected file, with what the page shows of
 * it. `corrections` is keyed by citation, `TS29.272.py#area-scope-code`.
 * `blocks` are its `; Type:` blocks in file order, by index into `lines`.
 */
export interface Document {
  blocks: Block[];
  corrections: {
    [k: string]: Correction;
  };
  findings: Finding[];
  holes: Hole[];
  id: string;
  interfaces: string[] | null;
  lines: Line[];
  path: string;
  pinned: string | null;
  publisher: '3GPP' | '3GPP2' | 'ETSI' | 'IETF' | 'OMA' | 'oneM2M';
  raw: string | null;
  reference: string;
  release: number | null;
  schema_version: number;
  sections: Section[];
  source: Source;
  specification: string;
  title: string;
  version: string | null;
}
/**
 * A `; Type:` block of a file: lines `line` (its `; Type:` line) to
 * `last`, comments included. `fields` holds its other directives as printed,
 * `Name` to `Applies-To`; `name` and `abbreviation` are what its `; Name:`
 * or `; AVP:` names. What else it holds depends on `type`:
 *
 * - `rule` for a Message, Answer Message, Grouped AVP or Reprinted AVP, with
 *   `command` for a Message and `avp` for a Grouped or Reprinted AVP;
 * - `avp` and `values` for an Enumerated AVP;
 * - `columns` and `rows` for an AVP Table or Reused AVPs block;
 * - `columns`, `allocations` and `reservations` for a Registry;
 * - `value_rows` for a Value Table.
 *
 * `commands` marks where its lines name a command.
 */
export interface Block {
  abbreviation?: string | null;
  allocations?: Allocation[];
  avp?: AvpHeader | null;
  columns?: string[];
  command?: Command | null;
  commands?: CommandSpan[];
  fields: {
    [k: string]: string;
  };
  last: number;
  line: number;
  name?: string | null;
  page: number | null;
  reservations?: Reservation[];
  rows?: TableRow[];
  rule?: Rule | null;
  section: string;
  type: string;
  value_rows?: ValueRow[];
  values?: EnumEntry[];
}
/**
 * A row of a Registry block at `line`, `cells` as a `TableRow`'s. `code`
 * is null where the row prints a placeholder; `name` and `abbreviation` are
 * unquoted, null for a dash. `documents` are the exported documents its
 * Defined-In cell resolves to; `vendor` is an AVP Codes row's, the file's
 * `; Vendor-ID:`.
 */
export interface Allocation {
  abbreviation?: string | null;
  cells: string[];
  code: number | null;
  documents?: string[];
  line: number;
  name?: string | null;
  vendor?: number | null;
}
/**
 * What an AVP's `< AVP header: code vendor-id >` says; `vendor_id` is
 * null where it prints none.
 */
export interface AvpHeader {
  code: number;
  vendor_id: number | null;
}
/**
 * A Message block's header. `flags` in printed order; `application_id`
 * is the effective id, the header's or for a bare header the one the first
 * Application Scope block covering its clause states (`scope`, that block's
 * clause). `application` names the application, and `stated_in` is the
 * clause of the scope block naming it, as `CommandIdentity` reads them.
 */
export interface Command {
  application?: string | null;
  application_id: number | null;
  code: number;
  flags: CommandFlag[];
  header_application_id: number | null;
  request: boolean;
  scope?: string | null;
  stated_in?: string | null;
}
/**
 * Characters `start` to `end` of line `line` name a command: a Message
 * block's name, abbreviation or rule head, a half of a Command Codes row's
 * name or abbreviation, or a table's column for it. `block` indexes the
 * document's Message block for it; a registry half has none.
 */
export interface CommandSpan {
  abbreviation?: string | null;
  block?: number | null;
  code: number;
  end: number;
  line: number;
  name: string;
  request: boolean;
  start: number;
}
/**
 * A registry's `; RESERVED first..last` line at `line`.
 */
export interface Reservation {
  defined_in?: string[];
  first: number;
  last: number;
  line: number;
  purpose?: string | null;
}
/**
 * A row of an AVP Table or Reused AVPs block at `line`. `cells` are as
 * printed, one per column, quotes kept: `""` is a blank cell, `-` a dash.
 * The rest is what needs more than a cell to read: `name` unquoted, `vendor`
 * the vendor space the row places the AVP in (its Vendor-ID cell, else its V
 * flag read with the file's `; Vendor-ID:`), and `marks` each mark column's
 * marks, unquoted, with no marks for a dash and no entry for a blank cell.
 */
export interface TableRow {
  cells: string[];
  line: number;
  marks?: {
    [k: string]: string[];
  };
  name: string;
  vendor?: number | null;
}
/**
 * A block's ABNF rule: the name its `::=` line at `line` defines
 * (`answer-message` for an Answer Message block) and its members in file
 * order, struck ones included.
 */
export interface Rule {
  line: number;
  members: Member[];
  name: string;
}
/**
 * A member of a rule, at its `line`. `qualifier` is as printed (`1*`,
 * `*2`, or empty); `min` and `max` are RFC 6733 clause 3.2's bounds, `max`
 * null for none. A `strikethrough` member is one the document prints struck
 * through and the rule keeps. A `struck` member is a commented-out line keeping its `;
 * strikethrough`, as the document strikes it, and no member of the rule the
 * corpus reads.
 */
export interface Member {
  bold?: boolean;
  line: number;
  max: number | null;
  min: number;
  name: string;
  presence: Presence;
  qualifier?: string;
  strikethrough?: boolean;
  struck?: boolean;
}
/**
 * A Value Table row at `line`. `section` is a result code's own clause,
 * `mark` a feature's M/O, `origin` the document a result code's row says
 * defines it, and `origin_target` where its token links.
 */
export interface ValueRow {
  line: number;
  mark?: string | null;
  name: string;
  origin?: string | null;
  origin_target?: Target | null;
  section?: string | null;
  value: number;
}
/**
 * A line of an Enumerated AVP's body at `line`: a `value` with its
 * `name`, or a `reserved`, `void` or `vendor-specific` range `first` to
 * `last`. `description` is what the line says of it.
 */
export interface EnumEntry {
  description?: string | null;
  first: number;
  kind: 'value' | 'reserved' | 'void' | 'vendor-specific';
  last: number;
  line: number;
  name?: string | null;
}
/**
 * A declaration the file cites, by its reason.
 */
export interface Correction {
  kind: 'correction' | 'delete' | 'insert' | 'supply' | 'accept';
  reason: string;
}
/**
 * A linter finding on the file. `accepted_by` cites the acceptance, whose
 * reason is in the document's `corrections`.
 */
export interface Finding {
  accepted_by: string | null;
  message: string;
  origin: string | null;
  rule: string;
  section: string | null;
  severity: Severity;
}
/**
 * A name the corpus cannot complete (`model.Hole`): the document that falls
 * short, what it leaves unstated in `missing`, and what it does state.
 * `recorded` is the reason the corpus's record of known holes gives.
 */
export interface Hole {
  across_releases: CrossRelease | null;
  code: number | null;
  conflict: string | null;
  data_type: DataType | null;
  flag_rules: FlagRules | null;
  missing: string[];
  name: string;
  origin: string | null;
  recorded: string | null;
  reference: string;
  section: string | null;
  undefined: UndefinedBlock | null;
  vendor_id: number | null;
  version: string | null;
  wireshark_name: string | null;
}
/**
 * AVP flag rules, as a table's columns place the flags. `application_defined`
 * holds a bit RFC 6733 leaves to the application using the AVP.
 */
export interface FlagRules {
  application_defined: AvpFlag[];
  may: AvpFlag[];
  must: AvpFlag[];
  must_not: AvpFlag[];
  should_not: AvpFlag[];
}
/**
 * The `Undefined AVP` block declaring a name no document defines.
 */
export interface UndefinedBlock {
  cited_in: string[];
  note: string | null;
  page: number | null;
  section: string;
}
/**
 * One line of a file. `anchor` is the clause this line is the link target
 * of, `section` the clause it sits in, and `warning` marks a raw line the
 * corrected file changes.
 */
export interface Line {
  anchor?: string | null;
  section?: string | null;
  tokens: Token[];
  warning?: boolean;
}
/**
 * A span of a file's text. Every token joined gives the file, byte for
 * byte. Highlighting is the client's, from the editor grammar; `kind` marks
 * only the `;;` comments, a note citing a declaration as `correction-note`.
 */
export interface Token {
  avp?: string | null;
  correction?: string | null;
  kind?: ('comment' | 'correction-note') | null;
  source?: Citation | null;
  target?: Target | null;
  text: string;
}
/**
 * A place in the source document, for a link into it. `name` and `row` mark
 * an AVP-table row's name, whose source is its table and not its definition.
 */
export interface Citation {
  name?: string | null;
  page?: number | null;
  row?: boolean;
  section: string;
}
/**
 * A clause of the file, for its table of contents. `title` is what the file
 * places there: "Message User-Data-Request", "AVP Table", "Grouped AVP
 * Server-Capabilities", or "AVP PCSCF-FQDN" for a clause only a table row names.
 */
export interface Section {
  page: number | null;
  section: string;
  title: string;
}
/**
 * `documents/<id>.raw.json`: the raw mirror of a file, for the raw view,
 * with its own `blocks`, by index into its own `lines`.
 */
export interface RawDocument {
  blocks: Block[];
  id: string;
  lines: Line[];
  schema_version: number;
}
