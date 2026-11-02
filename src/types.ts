export interface Target { document: string; section: string | null; name?: string }
export interface SourcePosition { section: string; page: number | null; name?: string; exact?: boolean; occurrence?: boolean; row?: boolean }
export interface Token {
  text: string;
  class: string;
  target?: Target;
  source?: SourcePosition;
  correction?: string;
  avp?: string;
}
export interface Line { tokens: Token[]; anchor: string | null; section: string | null; class?: string; warning?: boolean }
export interface DocumentMeta {
  id: string;
  reference: string;
  specification: string;
  version: string | null;
  publisher: string;
  release: string | null;
  title: string;
  pinned: string | null;
  source: { url: string; local: string | null; text?: string };
}
export interface Finding {
  severity: string; rule: string; message: string; section: string | null;
  accepted_by: string | null;
}
export interface Hole { name: string; missing: string[]; recorded: string | null; section: string | null }
export interface DocumentData extends DocumentMeta {
  sections: SourcePosition[];
  lines: Line[];
  raw: Line[] | null;
  corrections: Record<string, string>;
  findings: Finding[];
  holes: Hole[];
}
export interface SearchEntry {
  name: string;
  kind: string;
  alias: string | null;
  document: string;
  target: Target | null;
  identity: number[] | null;
  defined_in: string | null;
  data_type: string | null;
  across_releases: { cited: string; version: string; rule: string } | null;
}
export interface IndexData {
  schema_version: number;
  mode: 'public' | 'self-hosted';
  documents: DocumentMeta[];
  search: SearchEntry[];
  mentions: { document: string; section: string | null; line: number; text: string; avps: string[] }[];
}
