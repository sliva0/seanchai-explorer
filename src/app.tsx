import type { ComponentChildren } from 'preact';
import { useLayoutEffect } from 'preact/hooks';
import type { Site } from './data.ts';
import { DocumentPage } from './document-view.tsx';
import type { DocumentView, ViewServices } from './document-view.tsx';
import { HelpDialog, HelpToggle, useHelp } from './help.tsx';
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

/** What the content shows, as the router has worked it out. */
export type Page =
  /** Nothing yet: the site is still being opened. */
  | { kind: 'start' }
  | { kind: 'index' }
  /** A search; `key` is the arrival, each of which starts the page afresh. */
  | { kind: 'search'; key: number; query: string; returning: boolean; onReady(): void }
  | { kind: 'wireshark' }
  | { kind: 'message'; heading: string; detail?: string }
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
}

/** The content's class, which the stylesheet lays each page out by. */
const pageClass: Partial<Record<Page['kind'], string>> = {
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

function Content({ site, page, jumps, walk }: Omit<AppProps, 'theme' | 'toggleTheme'>): ComponentChildren {
  switch (page.kind) {
    case 'start':
      return null;
    case 'index':
      return <IndexView site={site!} />;
    case 'search':
      return (
        <SearchView key={page.key} site={site!} query={page.query} returning={page.returning} onReady={page.onReady} />
      );
    case 'wireshark':
      return <WiresharkView site={site!} />;
    case 'message':
      return (
        <>
          <h1 tabIndex={-1}>{page.heading}</h1>
          {page.detail && <p>{page.detail}</p>}
        </>
      );
    case 'loading':
      return <p role="status">{`Loading ${page.label}…`}</p>;
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

/** The site: the header, and the page the route shows under it. */
export function App(props: AppProps) {
  const { page, theme, toggleTheme } = props;
  const help = useHelp();
  useSearchKey();
  const other = theme === 'light' ? 'Dark' : 'Light';
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
        Skip to content
      </a>
      <header>
        <nav>
          <NavLink href="#" current={page.kind === 'index'}>
            Index
          </NavLink>
          <NavLink href="#search" current={page.kind === 'search'}>
            Search
          </NavLink>
          <NavLink href={`#${WIRESHARK}`} current={page.kind === 'wireshark'} title="Wireshark plugin">
            Wireshark
          </NavLink>
        </nav>
        <div class="header-actions">
          <HelpToggle help={help} />
          <button type="button" class="control theme-toggle" aria-label={`${other} theme`} onClick={toggleTheme}>
            {other}
          </button>
        </div>
      </header>
      <main id="content" tabIndex={-1} class={pageClass[page.kind] ?? ''}>
        <Content {...props} />
      </main>
      <HelpDialog help={help} />
    </>
  );
}
