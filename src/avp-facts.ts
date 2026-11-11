import { allAvpRows, byName, cell, perFile } from './blocks.ts';
import type { DadFile } from './blocks.ts';
import type { DataType } from './types.ts';
import { valueTables } from './values.ts';
import type { ValueTable } from './values.ts';

/** What a file says an AVP is. A field it does not say is left out. */
export interface AvpIdentity { code?: number; vendor?: number; type?: DataType }

/** An `Enumerated AVP` block: the names its AVP gives its numbers. `line` is its `; Type:` line. */
export interface EnumeratedBlock { name: string; section: string; page: number | null; line: number }

const dataTypes = new Set<string>(['OctetString', 'Integer32', 'Integer64', 'Unsigned32', 'Unsigned64', 'Float32', 'Float64', 'Grouped', 'Address', 'Time', 'UTF8String', 'DiameterIdentity', 'DiameterURI', 'Enumerated', 'IPFilterRule', 'QoSFilterRule']);

/** Only what a source says: a field it leaves unsaid is no field. */
const said = (found: Record<keyof AvpIdentity, number | string | null | undefined>): AvpIdentity =>
  Object.fromEntries(Object.entries(found).filter(([, value]) => value !== undefined && value !== null)) as AvpIdentity;

/** The identities a file gives names, in file order: its rules' headers and its table rows. */
const identitiesOf = perFile(file => {
  const headers = file.blocks.flatMap(block => block.avp ? [{
    line: block.line, name: block.rule?.name ?? block.name!,
    identity: said({ code: block.avp.code, vendor: block.avp.vendor_id, type: block.type === 'Enumerated AVP' ? 'Enumerated' : 'Grouped' }),
  }] : []);
  const rows = allAvpRows(file).map(row => {
    const printed = cell(row, 'Type');
    return { line: row.line, name: row.name, identity: said({ code: row.code, vendor: row.vendor, type: printed && dataTypes.has(printed) ? printed : undefined }) };
  });
  const found = [...headers, ...rows].sort((a, b) => a.line - b.line).filter(({ identity }) => Object.keys(identity).length);
  return byName(found.map(({ name, identity }) => [name, identity]));
});

const enumeratedOf = perFile(({ blocks }) => byName(blocks.flatMap((block): [string, EnumeratedBlock][] =>
  block.type === 'Enumerated AVP' && block.avp ? [[block.name!, { name: block.name!, section: block.section, page: block.page, line: block.line }]] : [])));

const fields = ['code', 'vendor', 'type'] as const;
/** `a` says all `b` does, and maybe more. */
const covers = (a: AvpIdentity, b: AvpIdentity) => fields.every(field => b[field] === undefined || a[field] === b[field]);

/**
 * The identities some files give an AVP's name: its AVP table rows, its rule's header, a registry's row. Each distinct
 * one once, and one that only leaves out what another says folded into it, so that what is left disagrees.
 */
export function avpIdentities(files: { file: DadFile; name: string }[]): AvpIdentity[] {
  const all = files.flatMap(({ file, name }) => identitiesOf(file).get(name) ?? []);
  return all.filter((item, index) => !all.some((other, at) => at !== index && covers(other, item) && (!covers(item, other) || at < index)));
}

/** The tables a file gives an AVP's numbers in, in file order: its value tables, and its `Enumerated AVP` block. */
export function avpTables(file: DadFile, name: string): (ValueTable | EnumeratedBlock)[] {
  const tables: (ValueTable | EnumeratedBlock)[] = valueTables(file).filter(table => table.avp?.name === name);
  return [...tables, ...enumeratedOf(file).get(name) ?? []].sort((a, b) => a.line - b.line);
}
