import { publisherRank } from './data.ts';
import { INDEX } from './navigation.ts';
import type { DocumentSummary, Index } from './types.ts';
import { indexPage } from './text/site.ts';

// The index's tabs: a publisher's documents a tab each, and within one whose documents have releases, a tab per release
// and one of the older copies held for citations. The tab shown is in the route, `#index/<publisher>[/<release>|/older]`,
// and the first publisher's newest release is plain `#`.

/** The release tab of the copies `pinned` says are held for later citations, whatever their release. */
export const OLDER = 'older';

export type ReleaseKey = number | null | typeof OLDER;

export interface ReleaseTab {
  key: ReleaseKey;
  label: string;
  docs: DocumentSummary[];
  /** What follows `#index/` in its route, empty for the index's first tab. */
  path: string;
}

export interface PublisherTab {
  publisher: string;
  /** The publisher's name in a route: `3gpp`, `ietf`. */
  slug: string;
  /** Newest release first, then the older copies; a publisher with no releases has one, of all its documents. */
  releases: ReleaseTab[];
  /** Every document of the publisher's, in any of its tabs. */
  docs: DocumentSummary[];
}

/** What the index shows: every publisher's tab, and the publisher and release selected. */
export interface IndexTab {
  publishers: PublisherTab[];
  publisher: PublisherTab;
  release: ReleaseTab;
}

const byName = (a: DocumentSummary, b: DocumentSummary) =>
  a.specification.localeCompare(b.specification, undefined, { numeric: true }) || a.id.localeCompare(b.id);

/** Older copies of one specification, newest first, as each is held for a different citation. */
const byNameAndRelease = (a: DocumentSummary, b: DocumentSummary) =>
  a.specification.localeCompare(b.specification, undefined, { numeric: true }) ||
  (b.release ?? -1) - (a.release ?? -1) ||
  a.id.localeCompare(b.id);

export const slugOf = (publisher: string) => publisher.toLowerCase();

export function releaseLabel(key: ReleaseKey): string {
  if (key === OLDER) return indexPage.olderCopies;
  return key === null ? indexPage.noRelease : indexPage.release(key);
}

/** The route of a tab: `#` for the first. */
export const tabHref = (path: string) => (path ? `#${INDEX}/${path}` : '#');

/** Every publisher's tabs, in the order of any list by publisher. */
export function indexTabs(index: Pick<Index, 'documents'>): PublisherTab[] {
  const byPublisher = new Map<string, DocumentSummary[]>();
  for (const doc of index.documents) byPublisher.set(doc.publisher, [...(byPublisher.get(doc.publisher) ?? []), doc]);
  return [...byPublisher]
    .toSorted(([a], [b]) => publisherRank(a) - publisherRank(b))
    .map(([publisher, docs], rank) => {
      const slug = slugOf(publisher);
      const current = new Map<number | null, DocumentSummary[]>();
      for (const doc of docs.filter(doc => !doc.pinned))
        current.set(doc.release, [...(current.get(doc.release) ?? []), doc]);
      const pinned = docs.filter(doc => doc.pinned);
      const groups: [ReleaseKey, DocumentSummary[]][] = [
        ...[...current].toSorted(([a], [b]) => (b ?? -1) - (a ?? -1)),
        ...(pinned.length ? [[OLDER, pinned] as [ReleaseKey, DocumentSummary[]]] : []),
      ];
      const releases = groups.map(([key, group], at) => ({
        key,
        label: releaseLabel(key),
        docs: group.toSorted(key === OLDER ? byNameAndRelease : byName),
        path: at === 0 ? (rank === 0 ? '' : slug) : `${slug}/${key ?? 'none'}`,
      }));
      return { publisher, slug, releases, docs };
    });
}

/** The tab a route's path after `index/` names, or the nearest one there is: an unknown publisher is the first, an unknown release the newest. */
export function selectTab(publishers: PublisherTab[], path: string): IndexTab | undefined {
  const [slug = '', release = ''] = path.toLowerCase().split('/');
  const publisher = publishers.find(tab => tab.slug === slug) ?? publishers[0];
  if (!publisher) return undefined;
  const named = publisher.releases.find(tab => String(tab.key ?? 'none') === release);
  return { publishers, publisher, release: named ?? publisher.releases[0] };
}

/** A tab's name for the window's title and the jump list: none for the first, which is the index itself. */
export function tabTitle({ publisher, release }: IndexTab): string | undefined {
  if (!release.path) return undefined;
  return publisher.releases.length > 1 ? indexPage.tabHeading(publisher.publisher, release.label) : publisher.publisher;
}
