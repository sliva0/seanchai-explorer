import { SCHEMA_VERSION } from './types.ts';

/**
 * The export schemas the site reads: its own, and 2, which the PyPI release `seanchai-release.json` pins still writes.
 * A schema-2 export has no `commands.json`, which prepare then derives, and prints a reprinted rule as a
 * `Reprinted AVP` block. Drop the 2 once the pin writes this schema, as CONTRIBUTING.md's "Generated files" says.
 */
export const READ_SCHEMAS: readonly number[] = [2, SCHEMA_VERSION];

export const readsSchema = (version: number) => READ_SCHEMAS.includes(version);
