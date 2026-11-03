import assert from 'node:assert/strict';
import test from 'node:test';
import { compactComment } from '../../src/comments.ts';

test('compact comments remove only citation and occurrence markers', () => {
  assert.equal(compactComment(";; deleted: AVP rule 'Session-Id' (occurrence 2) (TS29.229.py#rta-session-id-repeated)"), ";; deleted: AVP rule 'Session-Id'");
  assert.equal(compactComment(";; deleted: AVP table row 'Load' (TS29.229.py#load-row-not-local)"), ";; deleted: AVP table row 'Load'");
  assert.equal(compactComment(';; note (keep this explanation)'), ';; note (keep this explanation)');
});
