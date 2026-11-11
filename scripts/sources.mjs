// Downloads the source documents a self-hosted build ships: node scripts/sources.mjs. See README.md.
import { seanchai, specifications } from './seanchai.mjs';

// Unconverted: the site shows the PDFs and RFC texts, and only extraction reads the Word files.
seanchai(['corpus', 'download', '--no-convert', '-o', specifications], { extract: true });
console.log(`Sources are in ${specifications}`);
