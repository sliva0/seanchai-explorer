// Words several parts of the site say alike: a value table's kinds, an information element's category, the pieces of
// a table's name. Each entry's comment says where it shows; see site.ts for the marks.

import type { ValueKind } from '../types.ts';

/** A value table's kinds: `title` heads a search section and names a table in a popup, `row` names one of its rows. */
export const valueKindWords = {
  'result-codes': { title: 'Result codes', row: 'Result code' },
  bits: { title: 'Bits', row: 'Bit' },
  features: { title: 'Features', row: 'Feature bit' },
  /** An integer AVP's named values, as a table in its clause prints them (TS 29.272's Group-Service-Id). */
  values: { title: 'Values', row: 'Value' },
} satisfies Record<ValueKind, { title: string; row: string }>;

/** What a value table lists beyond its kind: "Features list 1 (S6a/S6d)". */
export const valueTableWords = {
  /** After the kind: the Feature-List-ID it is the list of. */
  list: (id: number) => ` list ${id}`,
  /** After that: the application or interface the table is of. */
  application: (application: string) => ` (${application})`,
};

/**
 * An information element's category in its table: after the letter, "M, mandatory". OM and OC are TS 32.299's, as
 * TS 32.240 defines them, operator provisionable; its dash is a row not used in that command.
 */
export const categoryWords = {
  M: 'mandatory',
  C: 'conditional',
  O: 'optional',
  OM: 'mandatory where the operator provisions it',
  OC: 'conditional where the operator provisions it',
  '-': 'not used',
} as const;

/** "M, mandatory", and a dash's "not used" alone. */
export const categoryText = (category: string, words: string) => (category === '-' ? words : `${category}, ${words}`);

/** A table by its number, "table 5.2.2.2.1/1": in popups, the search page, marks' titles and section names. */
export const tableName = (table: string) => `table ${table}`;

/** A section's tables where none names its command: "the table in section 5.2.2.2.1", "3 tables". */
export const tableIn = (section: string) => `the table in section ${section}`;
export const tablesCount = (count: number) => `${count} tables`;

/** An information element offering several AVPs: "one of Result-Code, Experimental-Result". */
export const oneOf = (names: string[]) => `one of ${names.join(', ')}`;
