import assert from 'node:assert/strict';
import test from 'node:test';
import { commentCitations, compactComment } from '../../src/comments.ts';

test('compact comments remove only citation and occurrence markers', () => {
  assert.equal(
    compactComment(";; deleted: AVP rule 'Session-Id' (occurrence 2) (TS29.229.py#rta-session-id-repeated)"),
    ";; deleted: AVP rule 'Session-Id'",
  );
  assert.equal(
    compactComment(";; deleted: AVP table row 'Load' (TS29.229.py#load-row-not-local)"),
    ";; deleted: AVP table row 'Load'",
  );
  assert.equal(compactComment(';; note (keep this explanation)'), ';; note (keep this explanation)');
  assert.equal(
    compactComment(';; interpreted: (TS29.272.dadx#imei-digits)'),
    ';; interpreted',
    'no colon left before nothing',
  );
  assert.equal(
    compactComment(';; inserted: from clause 16.4.7 (TS29.061.py#3gpp-sgsn-mcc-mnc-row)'),
    ';; inserted: from clause 16.4.7',
  );
  assert.equal(
    compactComment(';; patched: the table prints no Diameter header, see TS32.299.toml'),
    ';; patched: the table prints no Diameter header, see TS32.299.toml',
  );
  assert.equal(
    compactComment(';; AVP * - - - - Grouped - - - - ; the * [ AVP ] wildcard'),
    ';; AVP * - - - - Grouped - - - - ; the * [ AVP ] wildcard',
  );
});

test("a note's citations are what its compact form leaves out, in order", () => {
  assert.equal(
    commentCitations(";; deleted: AVP rule 'Session-Id' (occurrence 2) (TS29.229.py#rta-session-id-repeated)"),
    '(occurrence 2) (TS29.229.py#rta-session-id-repeated)',
  );
  assert.equal(
    commentCitations(';; corrected: (TS29.061.py#acr-ms-timezone-spelling)'),
    '(TS29.061.py#acr-ms-timezone-spelling)',
  );
  assert.equal(
    commentCitations(';; inserted: from clause 16.4.7 (TS29.061.py#3gpp-sgsn-mcc-mnc-row)'),
    '(TS29.061.py#3gpp-sgsn-mcc-mnc-row)',
  );
  assert.equal(
    commentCitations(';; interpreted: (TS29.272.dadx#imei-digits)'),
    '(TS29.272.dadx#imei-digits)',
    "an interpretation's .dadx file",
  );
  assert.equal(commentCitations(';; note (keep this explanation)'), '', 'none');
});
