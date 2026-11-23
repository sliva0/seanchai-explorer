import type { Place } from './avp-places.ts';
import type { DadFile } from './blocks.ts';
import { elementsBlock, messageBlock } from './elements.ts';
import type { ElementTable, IndexedElementRow } from './elements.ts';
import type { Document } from './types.ts';

/**
 * Where a table's row is: in this document, the row of the file at hand, raw or corrected, which its name finds,
 * and in the pane the table's clause at the AVP; in another, the row's line there, which the view goes to.
 */
export function elementPlace(
  table: ElementTable,
  row: IndexedElementRow,
  avp: string,
  file: DadFile,
  doc: Pick<Document, 'id'>,
): Place {
  const target = { document: table.document, section: table.section, name: avp };
  if (table.document !== doc.id) return { document: table.document, target, line: row.line };
  const block = elementsBlock(file, table.section, table.command);
  const line = block?.element_rows?.find(other => other.name === row.name && other.avps?.includes(avp))?.line;
  return {
    document: doc.id,
    position: { section: table.section, page: table.page, name: avp, row: true },
    target,
    line: line ?? block?.line,
  };
}

/** Where a table is: its `; Type:` line, in this document the one of the file at hand, and in the pane its clause. */
export function tablePlace(table: ElementTable, file: DadFile, doc: Pick<Document, 'id'>): Place {
  const target = { document: table.document, section: table.section };
  if (table.document !== doc.id) return { document: table.document, target, line: table.line };
  return {
    document: doc.id,
    position: { section: table.section, page: table.page },
    target,
    line: elementsBlock(file, table.section, table.command)?.line ?? table.line,
  };
}

/** Where the members a row maps to are: in this document the lines of the file at hand, in another the index's. */
export function memberPlaces(
  table: ElementTable,
  row: IndexedElementRow,
  file: DadFile,
  doc: Pick<Document, 'id'>,
): { place: Place; member: string }[] {
  const { message } = table;
  if (message.document !== doc.id) {
    return row.members.map(member => ({
      member: member.name,
      place: {
        document: message.document,
        target: { document: message.document, section: message.section, name: member.name },
        line: member.line,
      },
    }));
  }
  const block = messageBlock(file, message.section, message.name);
  return (block?.rule?.members ?? [])
    .filter(member => row.avps.includes(member.name))
    .map(member => ({
      member: member.name,
      place: {
        document: doc.id,
        position: { section: message.section, page: block!.page, name: member.name },
        target: { document: doc.id, section: message.section, name: member.name },
        line: member.line,
      },
    }));
}
