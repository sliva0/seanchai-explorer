// Downloads the source documents a self-hosted build ships: node scripts/sources.mjs. See README.md.
import { downloads, seanchai } from './seanchai.mjs';

// Unconverted: the site shows the PDFs and RFC texts, and only extraction reads the Word files. Into this repository's
// own specifications/ unless SEANCHAI_SPECIFICATIONS says otherwise, never a Seanchaí checkout's, whose converted
// documents a download without conversion would drop.
seanchai(['corpus', 'download', '--no-convert', '-o', downloads], { extract: true });
console.log(`Sources are in ${downloads}`);
