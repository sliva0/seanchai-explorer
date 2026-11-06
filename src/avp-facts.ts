import type { DataType, Line } from './types.ts';
import { lineText, valueTables } from './values.ts';
import type { ValueTable } from './values.ts';

/** What a file says an AVP is. A field it does not say is left out. */
export interface AvpIdentity { code?: number; vendor?: number; type?: DataType }

/** An `Enumerated AVP` block: the names its AVP gives its numbers. `line` is its `; Type:` line. */
export interface EnumeratedBlock { name: string; section: string; page: number | null; line: number }

interface Facts { identities: Map<string, AvpIdentity[]>; enumerated: Map<string, EnumeratedBlock[]> }

const dataTypes = new Set<string>(['OctetString', 'Integer32', 'Integer64', 'Unsigned32', 'Unsigned64', 'Float32', 'Float64', 'Grouped', 'Address', 'Time', 'UTF8String', 'DiameterIdentity', 'DiameterURI', 'Enumerated', 'IPFilterRule', 'QoSFilterRule']);
const directive = /^; ([\w-]+): (.*?)\s*(?:;;.*)?$/;
const avpHeader = /^([A-Za-z0-9][A-Za-z0-9_-]*) ::= < (Enumerated )?AVP header: (\d+)(?: (\d+))? >/;
// A table's cells as the parser splits them: runs of non-space, a quoted run keeping its spaces.
const cells = /(?:"(?:[^"\\]|\\.)*"|[^\s"])+/g;
const number = (cell: string | undefined) => cell && /^\d+$/.test(cell) ? Number(cell) : undefined;
const flags = (cell: string | undefined) => cell?.split(',') ?? [];

/**
 * The vendor a row places its AVP in: its Vendor-ID cell, else as its V flag says, the file's own vendor where V is
 * a must and none where it is a must-not. A registry of AVP codes is of the file's own vendor.
 */
function rowVendor(type: string, cell: (column: string) => string | undefined, fileVendor: number | undefined): number | undefined {
  const stated = number(cell('Vendor-ID'));
  if (stated !== undefined || type === 'Reused AVPs') return stated;
  if (type === 'Registry') return fileVendor;
  if (flags(cell('M.not')).includes('V')) return 0;
  return flags(cell('Must')).includes('V') ? fileVendor : undefined;
}

function readFacts(lines: Line[]): Facts {
  const facts: Facts = { identities: new Map(), enumerated: new Map() };
  const add = <T>(map: Map<string, T[]>, name: string, item: T) => {
    const list = map.get(name);
    if (list) list.push(item);
    else map.set(name, [item]);
  };
  const identity = (name: string, found: AvpIdentity) => {
    const known = Object.fromEntries(Object.entries(found).filter(([, value]) => value !== undefined)) as AvpIdentity;
    if (Object.keys(known).length) add(facts.identities, name, known);
  };
  let fileVendor: number | undefined;
  let block: { type: string; fields: Map<string, string>; line: number; body: boolean } | undefined;
  lines.forEach((line, index) => {
    const text = lineText(line);
    const field = text.match(directive);
    if (field?.[1] === 'Type') { block = { type: field[2], fields: new Map(), line: index, body: false }; return; }
    if (!block) {
      if (field?.[1] === 'Vendor-ID') fileVendor = number(field[2]);
      return;
    }
    if (!text.trim()) {
      if (block.body) block = undefined;
      return;
    }
    if (field && !block.body) { block.fields.set(field[1], field[2]); return; }
    if (text.trimStart().startsWith(';')) return;
    const first = !block.body;
    block.body = true;
    const { type, fields } = block;
    if (type === 'Grouped AVP' || type === 'Reprinted AVP' || type === 'Enumerated AVP') {
      const header = first ? text.match(avpHeader) : null;
      if (!header) return;
      const [, name, enumerated, code, vendor] = header;
      identity(name, { code: Number(code), vendor: number(vendor), type: enumerated ? 'Enumerated' : 'Grouped' });
      const section = fields.get('Section') ?? line.section;
      if (enumerated && section) add(facts.enumerated, name, { name, section, page: number(fields.get('Page')) ?? null, line: block.line });
      return;
    }
    const tabulates = type === 'AVP Table' || type === 'Reused AVPs' || (type === 'Registry' && fields.get('Registry') === 'AVP Codes');
    const columns = fields.get('Columns')?.split(/\s+/);
    if (!tabulates || !columns) return;
    const row = text.match(cells) ?? [];
    const end = row.findIndex(value => value.startsWith(';'));
    if ((end < 0 ? row.length : end) !== columns.length) return;
    const cell = (column: string) => { const at = columns.indexOf(column); return at < 0 ? undefined : row[at]; };
    const name = cell('Name')?.replace(/^"(.*)"$/, '$1');
    if (!name) return;
    const printed = cell('Type');
    identity(name, { code: number(cell('Code')), vendor: rowVendor(type, cell, fileVendor), type: printed && dataTypes.has(printed) ? printed as DataType : undefined });
  });
  return facts;
}

const known = new WeakMap<Line[], Facts>();

function factsOf(lines: Line[]): Facts {
  let facts = known.get(lines);
  if (!facts) { facts = readFacts(lines); known.set(lines, facts); }
  return facts;
}

const fields = ['code', 'vendor', 'type'] as const;
/** `a` says all `b` does, and maybe more. */
const covers = (a: AvpIdentity, b: AvpIdentity) => fields.every(field => b[field] === undefined || a[field] === b[field]);

/**
 * The identities some files give an AVP's name: its AVP table rows, its rule's header, a registry's row. Each distinct
 * one once, and one that only leaves out what another says folded into it, so that what is left disagrees.
 */
export function avpIdentities(files: { lines: Line[]; name: string }[]): AvpIdentity[] {
  const all = files.flatMap(({ lines, name }) => factsOf(lines).identities.get(name) ?? []);
  return all.filter((item, index) => !all.some((other, at) => at !== index && covers(other, item) && (!covers(item, other) || at < index)));
}

/** The tables a file gives an AVP's numbers in, in file order: its value tables, and its `Enumerated AVP` block. */
export function avpTables(lines: Line[], name: string): (ValueTable | EnumeratedBlock)[] {
  const tables: (ValueTable | EnumeratedBlock)[] = valueTables(lines).filter(table => table.avp?.avp === name);
  return [...tables, ...factsOf(lines).enumerated.get(name) ?? []].sort((a, b) => a.line - b.line);
}
