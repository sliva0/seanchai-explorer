import { docNumber, docSubject, interfacesOf, publisherRank } from './data.ts';
import type { Site } from './data.ts';
import { routeFor } from './navigation.ts';
import type { DocumentSummary } from './types.ts';

/** A longer list of interfaces wraps, rather than push every title in its group across. */
const MAX_INTERFACES_WIDTH = 24;

const FOOTER_HELP =
  'Click an AVP or command name to see its details or its definition in the source pane, alt-click to move the text there too, right-click to see where an AVP is used or where else a command is printed.';

function byName(a: DocumentSummary, b: DocumentSummary) {
  return a.specification.localeCompare(b.specification, undefined, { numeric: true }) || a.id.localeCompare(b.id);
}

/** The heading above says the publisher and any release, so a row has only to tell an edition with no release. */
function rowNumber(doc: DocumentSummary, site: Site): string {
  return [docNumber(doc), doc.release ? '' : site.edition(doc)].filter(Boolean).join(' ');
}

function DocumentRow({ doc, site }: { doc: DocumentSummary; site: Site }) {
  const href = routeFor({ document: doc.id });
  const subject = docSubject(doc);
  return (
    <tr>
      <td class="doc-number">
        <a href={href}>{rowNumber(doc, site)}</a>
      </td>
      <td class="doc-interfaces">{interfacesOf(doc)}</td>
      <td class="doc-title">
        {/* A wider target for the mouse: the number is this row's one stop for the keyboard. */}
        {subject && (
          <a href={href} tabIndex={-1}>
            {subject}
          </a>
        )}
        {doc.pinned && <p>{doc.pinned}</p>}
      </td>
    </tr>
  );
}

function DocumentTable({ docs, site }: { docs: DocumentSummary[]; site: Site }) {
  return (
    <table class="document-table">
      <colgroup>
        <col class="number-column" />
        <col class="interfaces-column" />
        <col class="title-column" />
      </colgroup>
      <thead class="sr-only">
        <tr>
          <th>Specification</th>
          <th>Interfaces</th>
          <th>Title</th>
        </tr>
      </thead>
      <tbody>
        {docs.toSorted(byName).map(doc => (
          <DocumentRow key={doc.id} doc={doc} site={site} />
        ))}
      </tbody>
    </table>
  );
}

/** Documents by publisher, newest release first, with the pinned older ones folded with their reasons. */
function Release({ name, docs, site }: { name: string; docs: DocumentSummary[]; site: Site }) {
  const pinned = docs.filter(doc => doc.pinned);
  const current = docs.filter(doc => !doc.pinned);
  return (
    <section>
      {current.length > 0 && (
        <>
          <h2>{name}</h2>
          <DocumentTable docs={current} site={site} />
        </>
      )}
      {pinned.length > 0 && (
        <details class="pinned-release">
          <summary>{`${name}: ${pinned.length} held for later citations`}</summary>
          <DocumentTable docs={pinned} site={site} />
        </details>
      )}
    </section>
  );
}

/** A publisher's tables, separate by release and fold, with their columns one width: the two narrow ones are monospace. */
function Publisher({
  publisher,
  releases,
  site,
}: {
  publisher: string;
  releases: Map<number | null, DocumentSummary[]>;
  site: Site;
}) {
  const docs = [...releases.values()].flat();
  const widest = (text: (doc: DocumentSummary) => string) => Math.max(...docs.map(doc => text(doc).length));
  const style = {
    '--number-width': `${widest(doc => rowNumber(doc, site))}ch`,
    '--interfaces-width': `${Math.min(MAX_INTERFACES_WIDTH, widest(interfacesOf))}ch`,
  };
  return (
    <div class="publisher-group" style={style}>
      {[...releases]
        .toSorted(([a], [b]) => (b ?? -1) - (a ?? -1))
        .map(([release, docs]) => (
          <Release
            key={release}
            name={`${publisher}${release ? ` · Release ${release}` : ''}`}
            docs={docs}
            site={site}
          />
        ))}
    </div>
  );
}

/** The index page: every document by publisher and release. */
export function IndexView({ site }: { site: Site }) {
  const publishers = new Map<string, Map<number | null, DocumentSummary[]>>();
  for (const doc of site.index.documents) {
    const releases = publishers.get(doc.publisher) ?? new Map<number | null, DocumentSummary[]>();
    releases.set(doc.release, [...(releases.get(doc.release) ?? []), doc]);
    publishers.set(doc.publisher, releases);
  }
  const { corpus_version: corpus, seanchai_version: seanchai } = site.index;
  return (
    <>
      {[...publishers]
        .toSorted(([a], [b]) => publisherRank(a) - publisherRank(b))
        .map(([publisher, releases]) => (
          <Publisher key={publisher} publisher={publisher} releases={releases} site={site} />
        ))}
      <p class="versions">{FOOTER_HELP}</p>
      <footer class="versions">
        {[corpus && `Corpus ${corpus}`, seanchai && `seanchai ${seanchai}`, `${site.mode} build`]
          .filter(Boolean)
          .join(' · ')}
      </footer>
    </>
  );
}
