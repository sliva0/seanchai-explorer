import type { ComponentChildren } from 'preact';
import { useLayoutEffect } from 'preact/hooks';
import { docVersioned } from './data.ts';
import type { Site } from './data.ts';
import type { Failure, FailureContext } from './errors.ts';
import { FailureBoundary, FailurePanel } from './failure-view.tsx';
import { DocumentPage } from './document-view.tsx';
import type { DocumentView, ViewServices } from './document-view.tsx';
import { HelpDialog, HelpToggle, useHelp } from './help.tsx';
import type { IndexTab } from './index-tabs.ts';
import { IndexView } from './index-view.tsx';
import { JumpControls } from './jump-controls.tsx';
import { takesTyping } from './keys.ts';
import type { JumpTargets } from './jump-controls.tsx';
import type { JumpWalk } from './jump-list.ts';
import { WIRESHARK } from './navigation.ts';
import { SearchView } from './search-view.tsx';
import type { Theme } from './theme.ts';
import type { Document, RawDocument } from './types.ts';
import { WiresharkView } from './wireshark-view.tsx';
import { header, jumpPlaces, pageMessages } from './text/site.ts';

/** What the content shows, as the router has worked it out. */
export type Page =
  /** Nothing yet: the site is still being opened. */
  | { kind: 'start' }
  /** The index at a tab, none where the corpus holds no documents. */
  | { kind: 'index'; tab: IndexTab | undefined }
  /** A search; `key` is the arrival, each of which starts the page afresh. */
  | { kind: 'search'; key: number; query: string; returning: boolean; onReady(): void }
  | { kind: 'wireshark' }
  /** Something failed: the page says what, and the way back. */
  | { kind: 'failure'; failure: Failure }
  | { kind: 'loading'; label: string }
  /** A document's text, drawn afresh for each `key`: each load of it, which the router then positions. */
  | {
      kind: 'document';
      key: number;
      doc: Document;
      raw: RawDocument | undefined;
      services: ViewServices;
      onView(view: DocumentView): void;
    };

export interface AppProps {
  site: Site | undefined;
  page: Page;
  theme: Theme;
  toggleTheme(): void;
  /** Where each walk of the jump list goes, for a document's buttons. */
  jumps: JumpTargets;
  walk(walk: JumpWalk): void;
  /** Where the header's Index goes: the index's tab last shown in this browser. */
  indexHref: string;
  /** Told of a failure as a page was drawn, which the page shows in its place. */
  onRenderError?(error: unknown): void;
}

/** The content's class, which the stylesheet lays each page out by. */
const pageClass: Partial<Record<Page['kind'], string>> = {
  failure: 'failure-view',
  index: 'index-view',
  wireshark: 'wireshark-view',
  document: 'document-view',
};

/** The header's link to a page of the site, saying when it is the one shown. */
function NavLink({
  href,
  current,
  title,
  children,
}: {
  href: string;
  current: boolean;
  title?: string;
  children: string;
}) {
  return (
    <a class="control" href={href} title={title} aria-current={current ? 'page' : undefined}>
      {children}
    </a>
  );
}

function Content({
  site,
  page,
  jumps,
  walk,
  indexHref,
}: Omit<AppProps, 'theme' | 'toggleTheme' | 'onRenderError'>): ComponentChildren {
  switch (page.kind) {
    case 'start':
      return null;
    case 'index':
      return <IndexView site={site!} tab={page.tab} />;
    case 'search':
      return (
        <SearchView key={page.key} site={site!} query={page.query} returning={page.returning} onReady={page.onReady} />
      );
    case 'wireshark':
      return <WiresharkView site={site!} />;
    case 'failure':
      return <FailurePanel failure={page.failure} indexHref={indexHref} />;
    case 'loading':
      return <p role="status">{pageMessages.loading(page.label)}</p>;
    case 'document':
      return (
        <DocumentPage
          key={page.key}
          services={page.services}
          doc={page.doc}
          raw={page.raw}
          header={<JumpControls targets={jumps} onWalk={walk} />}
          onView={page.onView}
        />
      );
  }
}

/**
 * `/` outside a text box goes to search: the box of the page shown, the index's or the search page's, or else the search
 * page, which takes the focus to its box as it opens. The help, open, keeps the keys.
 */
function useSearchKey() {
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== '/' ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        takesTyping(document.activeElement) ||
        document.getElementById('help')?.hidden === false
      )
        return;
      event.preventDefault();
      const box = document.querySelector<HTMLInputElement>('#content .search-form input');
      if (box) {
        box.focus();
        box.select();
      } else location.hash = '#search';
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

/** What a page's failure says of where it was: the document drawn, or the site's own page, and the build's data. */
function failureContext(page: Page, site: Site | undefined): FailureContext {
  const seanchai = site?.index.seanchai_version ?? undefined;
  if (page.kind === 'document') return { document: docVersioned(page.doc), seanchai };
  const names: Partial<Record<Page['kind'], string>> = {
    index: jumpPlaces.index,
    search: jumpPlaces.search,
    wireshark: jumpPlaces.wireshark,
  };
  return { page: names[page.kind], seanchai };
}

/** The site: the header, and the page the route shows under it. */
export function App(props: AppProps) {
  const { page, theme, toggleTheme, indexHref } = props;
  const help = useHelp();
  useSearchKey();
  const other = theme === 'light' ? header.dark : header.light;
  return (
    <>
      {/* A link's own fragment would be taken for a route. */}
      <a
        class="skip-link"
        href="#"
        onClick={event => {
          event.preventDefault();
          const content = document.getElementById('content')!;
          (content.querySelector<HTMLElement>('#document') ?? content).focus();
        }}
      >
        {header.skip}
      </a>
      <header>
        <nav>
          <NavLink href={indexHref} current={page.kind === 'index'}>
            {header.index}
          </NavLink>
          <NavLink href="#search" current={page.kind === 'search'}>
            {header.search}
          </NavLink>
          <NavLink href={`#${WIRESHARK}`} current={page.kind === 'wireshark'} title={header.wiresharkTitle}>
            {header.wireshark}
          </NavLink>
        </nav>
        <div class="header-actions">
          <HelpToggle help={help} />
          <button
            type="button"
            class="control theme-toggle"
            aria-label={header.themeLabel(other)}
            onClick={toggleTheme}
          >
            {other}
          </button>
        </div>
      </header>
      <main id="content" tabIndex={-1} class={pageClass[page.kind] ?? ''}>
        <FailureBoundary
          page={page}
          context={failureContext(page, props.site)}
          indexHref={indexHref}
          onError={props.onRenderError}
        >
          <Content {...props} />
        </FailureBoundary>
      </main>
      <HelpDialog help={help} selfHosted={props.site?.mode === 'self-hosted'} />
    </>
  );
}
