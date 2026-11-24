import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { docNumber, docSubject, interfacesOf } from './data.ts';
import type { Site } from './data.ts';
import { OLDER, releaseLabel, tabHref } from './index-tabs.ts';
import type { IndexTab } from './index-tabs.ts';
import { routeFor } from './navigation.ts';
import { githubName, indexIntro, indexPage as text, PYPI, pypiName, REPOSITORY } from './text/site.ts';
import type { DocumentSummary } from './types.ts';

/** A longer list of interfaces wraps, rather than push every title in its group across. */
const MAX_INTERFACES_WIDTH = 24;

/** The heading above says the publisher and any release, so a row has only to tell an edition with no release. */
function rowNumber(doc: DocumentSummary, site: Site): string {
  return [docNumber(doc), doc.release ? '' : site.edition(doc)].filter(Boolean).join(' ');
}

const versionOf = (doc: DocumentSummary) => (doc.version ? `V${doc.version}` : '');

/** A cell's text: over the row's link, so that a drag selects it, which no browser lets a drag over a link's text do. */
function CellText({ children }: { children: ComponentChildren }) {
  return <span class="cell-text">{children}</span>;
}

/**
 * A row is one link, the number's, which is the row's one stop for the keyboard and reaches over the whole row, under
 * the other cells' text; a click on that text is passed to it (see `followRow`).
 */
function DocumentRow({ doc, site, versioned }: { doc: DocumentSummary; site: Site; versioned: boolean }) {
  const subject = docSubject(doc);
  const interfaces = interfacesOf(doc);
  // The older copies' tab holds every release: the reason a copy is held says which.
  const reason = doc.pinned && [doc.release && releaseLabel(doc.release), doc.pinned].filter(Boolean).join(' · ');
  return (
    <tr>
      <td class="doc-number">
        <a class="row-link" href={routeFor({ document: doc.id })}>
          {rowNumber(doc, site)}
        </a>
      </td>
      {versioned && <td class="doc-version">{doc.version && <CellText>{versionOf(doc)}</CellText>}</td>}
      <td class="doc-interfaces">{interfaces && <CellText>{interfaces}</CellText>}</td>
      <td class="doc-title">
        {(subject || reason) && (
          <CellText>
            {subject}
            {reason && <span class="doc-reason">{reason}</span>}
          </CellText>
        )}
      </td>
    </tr>
  );
}

/** Where the last press in a table was, to tell a click from the end of a drag. */
let pressed: { x: number; y: number } | undefined;

function press(event: MouseEvent) {
  pressed = { x: event.clientX, y: event.clientY };
}

/**
 * A click on a cell's text follows the row's link as a click on the link would, with its button and keys, so that the
 * middle button or Ctrl opens it in a new tab. One ending a drag that selected text leaves the selection; a click with
 * Ctrl leaves a selection made before it as it is, so the selection alone does not say.
 */
function followRow(event: MouseEvent) {
  const target = event.target as Element;
  if (target.closest('a') || (event.type === 'auxclick' && event.button !== 1)) return;
  const link = target.closest('tr')?.querySelector<HTMLAnchorElement>('.row-link');
  const dragged = pressed && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 3;
  if (!link || (dragged && document.getSelection()?.toString().trim())) return;
  event.preventDefault();
  const { button, ctrlKey, shiftKey, altKey, metaKey, view } = event;
  // The event's own kind, of the window it came from.
  const Click = event.constructor as typeof MouseEvent;
  link.dispatchEvent(
    new Click('click', {
      bubbles: true,
      cancelable: true,
      view,
      button,
      ctrlKey,
      shiftKey,
      altKey,
      metaKey,
    }),
  );
}

function DocumentTable({ docs, site, versioned }: { docs: DocumentSummary[]; site: Site; versioned: boolean }) {
  return (
    <table class="document-table">
      <colgroup>
        <col class="number-column" />
        {versioned && <col class="version-column" />}
        <col class="interfaces-column" />
        <col class="title-column" />
      </colgroup>
      <thead>
        <tr>
          <th>{text.number}</th>
          {versioned && <th>{text.version}</th>}
          <th>{text.interfaces}</th>
          <th>{text.title}</th>
        </tr>
      </thead>
      <tbody onMouseDown={press} onClick={followRow} onAuxClick={followRow}>
        {docs.map(doc => (
          <DocumentRow key={doc.id} doc={doc} site={site} versioned={versioned} />
        ))}
      </tbody>
    </table>
  );
}

interface TabLink {
  key: string;
  href: string;
  label: string;
  count: number;
  current: 'page' | 'true' | undefined;
}

/** A row of the index's tabs, each a link to its route, the one shown marked current. */
function Tabs({ label, tabs, release }: { label: string; tabs: TabLink[]; release?: boolean }) {
  return (
    <nav class={release ? 'index-tabs release-tabs' : 'index-tabs'} aria-label={label}>
      {tabs.map(tab => (
        <a key={tab.key} class="index-tab" href={tab.href} aria-current={tab.current}>
          {tab.label}
          <span class="tab-count">{tab.count}</span>
        </a>
      ))}
    </nav>
  );
}

/**
 * The tab's table, its columns as wide as the publisher's widest in any of its tabs, so that a switch of release moves
 * none: the narrow ones are monospace.
 */
function TabPanel({ tab, site }: { tab: IndexTab; site: Site }) {
  const { publisher, release } = tab;
  const widest = (text: (doc: DocumentSummary) => string) => Math.max(...publisher.docs.map(doc => text(doc).length));
  const versioned = publisher.docs.some(doc => doc.release !== null);
  const style = {
    '--number-width': `${widest(doc => rowNumber(doc, site))}ch`,
    '--version-width': `${widest(versionOf)}ch`,
    '--interfaces-width': `${Math.min(MAX_INTERFACES_WIDTH, widest(interfacesOf))}ch`,
  };
  const heading =
    publisher.releases.length > 1 ? text.tabHeading(publisher.publisher, release.label) : publisher.publisher;
  return (
    <section class="publisher-group" style={style} aria-labelledby="index-tab-heading">
      <h2 id="index-tab-heading" class="sr-only">
        {heading}
      </h2>
      {release.key === OLDER && <p class="tab-note">{text.olderCopiesNote}</p>}
      <DocumentTable docs={release.docs} site={site} versioned={versioned} />
    </section>
  );
}

/** The box at the top of the index, which goes to the search page with what is typed in it. */
function IndexSearch() {
  const [query, setQuery] = useState('');
  return (
    <form
      class="search-form"
      role="search"
      onSubmit={event => {
        event.preventDefault();
        location.hash = `#search?q=${encodeURIComponent(query.trim())}`;
      }}
    >
      <input
        class="control"
        aria-label={text.searchLabel}
        type="search"
        value={query}
        placeholder={text.searchPlaceholder}
        onInput={event => setQuery(event.currentTarget.value)}
      />
      <button class="control">{text.searchButton}</button>
    </form>
  );
}

/** The index page: a search box, what the site is, and the documents of the tab shown, by publisher and release. */
export function IndexView({ site, tab }: { site: Site; tab: IndexTab | undefined }) {
  const { corpus_version: corpus, seanchai_version: seanchai } = site.index;
  const releases = tab?.publisher.releases ?? [];
  return (
    <>
      <IndexSearch />
      <div class="index-intro">
        {!SEANCHAI_UNLINKED && <p>{indexIntro}</p>}
        {/* What this site was built from, and the project's two pages, on one line. */}
        <p class="versions">
          {[corpus && text.corpus(corpus), seanchai && text.seanchai(seanchai), text.build(site.mode)]
            .filter(Boolean)
            .join(' · ')}
          {!SEANCHAI_UNLINKED && (
            <>
              {' · '}
              <a href={REPOSITORY}>{githubName}</a>
              {' · '}
              <a href={PYPI}>{pypiName}</a>
            </>
          )}
        </p>
        <p class="versions">{text.clickHint}</p>
      </div>
      {tab && (
        <>
          <Tabs
            label={text.publishers}
            tabs={tab.publishers.map(publisher => ({
              key: publisher.slug,
              href: tabHref(publisher.releases[0].path),
              label: publisher.publisher,
              count: publisher.releases[0].docs.length,
              current: publisher === tab.publisher ? (releases.length > 1 ? 'true' : 'page') : undefined,
            }))}
          />
          {releases.length > 1 && (
            <Tabs
              label={text.releases(tab.publisher.publisher)}
              release
              tabs={releases.map(release => ({
                key: String(release.key),
                href: tabHref(release.path),
                label: release.label,
                count: release.docs.length,
                current: release === tab.release ? 'page' : undefined,
              }))}
            />
          )}
          <TabPanel tab={tab} site={site} />
        </>
      )}
    </>
  );
}
