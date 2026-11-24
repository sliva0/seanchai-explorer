// The index's tabs: which documents each holds and the route to it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { OLDER, indexTabs, selectTab, tabHref, tabTitle } from '../../src/index-tabs.ts';

const doc = (id, publisher, release, pinned = null) => ({ id, specification: id, publisher, release, pinned });

const documents = [
  doc('rfc1', 'IETF', null),
  doc('b-19', '3GPP', 19),
  doc('a-19', '3GPP', 19),
  doc('a-18', '3GPP', 18),
  doc('a-7', '3GPP', 7, 'Held for a citation.'),
  doc('x-2', 'Vendor', 2, 'Held too.'),
];

test('a publisher has its releases newest first, then its older copies, and a route each', () => {
  const tabs = indexTabs({ documents });
  assert.deepEqual(
    tabs.map(tab => [
      tab.slug,
      tab.releases.map(release => [release.label, release.path, release.docs.map(d => d.id)]),
    ]),
    [
      [
        '3gpp',
        [
          ['Release 19', '', ['a-19', 'b-19']],
          ['Release 18', '3gpp/18', ['a-18']],
          ['Older copies', '3gpp/older', ['a-7']],
        ],
      ],
      ['ietf', [['No release', 'ietf', ['rfc1']]]],
      ['vendor', [['Older copies', 'vendor', ['x-2']]]],
    ],
    'a publisher no list names comes last, and one holding only older copies has them as its one tab',
  );
  assert.equal(tabs[0].docs.length, 4, "every document of the publisher's, for the columns' widths");
  assert.equal(tabHref(''), '#');
  assert.equal(tabHref('3gpp/18'), '#index/3gpp/18');
});

test('a route selects its tab, or the nearest there is', () => {
  const tabs = indexTabs({ documents });
  const selected = path => {
    const tab = selectTab(tabs, path);
    return [tab.publisher.slug, tab.release.key, tabTitle(tab)];
  };
  assert.deepEqual(selected(''), ['3gpp', 19, undefined]);
  assert.deepEqual(selected('3GPP/18'), ['3gpp', 18, '3GPP · Release 18']);
  assert.deepEqual(selected('3gpp/older'), ['3gpp', OLDER, '3GPP · Older copies']);
  assert.deepEqual(selected('3gpp/17'), ['3gpp', 19, undefined]);
  assert.deepEqual(selected('ietf/18'), ['ietf', null, 'IETF']);
  assert.deepEqual(selected('nobody'), ['3gpp', 19, undefined]);
  assert.equal(selectTab([], ''), undefined, 'an empty corpus has no tab');
});
