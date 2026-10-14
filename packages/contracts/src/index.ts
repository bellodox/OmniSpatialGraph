export interface Extent {
  frame_id: string | null;
  t: number[] | null;
  q: number[] | null;
  ext_min: number[] | null;
  ext_max: number[] | null;
}

export interface Element {
  element_id: string;
  kind: string;
  op: 'assert' | 'retract';
  status: 'observed' | 'hypothesis' | 'approved' | 'policy';
  src: string | null;
  dst: string | null;
  predicate: string | null;
  extent: Extent | null;
  props: Record<string, unknown> | null;
  source_hash: string | null;
  valid_from: number | null;
  valid_to: number | null;
  observed_at: number | null;
  supersedes: string | null;
  content_hash: string;
}

export interface GraphRow extends Omit<Element, 'props'> {
  row_key: string;
  row_type: 'elem' | 'commit' | 'head';
  props: string | null;
  commit_id: string | null;
  branch: string | null;
  parents: string | null;
  delta_hash: string | null;
  actor: string | null;
  generation: number | null;
  committed_at: number | null;
  source_git_revision: string | null;
  head: string | null;
}

export interface GraphPort {
  rows(): Promise<GraphRow[]>;
  head(branch: string): Promise<string | null>;
  publish(rows: GraphRow[], expectedHead: string): Promise<boolean>;
}

export function blankRow(values: Partial<GraphRow> & Pick<GraphRow, 'row_key' | 'row_type'>): GraphRow {
  return { element_id: null, kind: null, op: null, supersedes: null, status: null,
    src: null, dst: null, predicate: null, valid_from: null, valid_to: null, observed_at: null,
    extent: null, props: null, source_hash: null, content_hash: null, commit_id: null, branch: null,
    parents: null, delta_hash: null, actor: null, generation: null, committed_at: null,
    source_git_revision: null, head: null, ...values } as GraphRow;
}

export class OsgError extends Error {
  constructor(public readonly code: string, message: string, public readonly details: Record<string, unknown> = {}) {
    super(message);
  }
}
