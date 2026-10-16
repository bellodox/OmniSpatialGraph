// Copyright 2026 Vlad Bellomorski
// SPDX-License-Identifier: Apache-2.0

import { OsgError, blankRow, type Element, type GraphPort, type GraphRow } from '../../contracts/src/index.js';
import { canon, contentHash, hash } from './hash.js';

export type Proposal = Omit<Element, 'content_hash' | 'supersedes'> & { supersedes?: string | null };
export interface Snapshot { rows: GraphRow[]; commits: Map<string, GraphRow>; reachable: Set<string>; state: Map<string, GraphRow>; }
const commitPattern = /^c[0-9a-f]{64}$/;
const idPattern = /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*:.+$/;

function storedJson(text: string, rowKey: string): unknown {
  try { return JSON.parse(text) as unknown; }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new OsgError('VERIFY_FAILED', `Invalid JSON ${rowKey}`);
  }
}

export function readParents(row: GraphRow): string[] {
  const parents = storedJson(row.parents!, row.row_key);
  if (!Array.isArray(parents) || !parents.length || parents.some((parent) => typeof parent !== 'string' || (parent !== 'ROOT' && !commitPattern.test(parent)))) {
    throw new OsgError('VERIFY_FAILED', `Invalid parents ${row.row_key}`);
  }
  return parents as string[];
}

function readProps(row: GraphRow): Record<string, unknown> | null {
  if (row.props == null) return null;
  const props = storedJson(row.props, row.row_key);
  if (props !== null && (typeof props !== 'object' || Array.isArray(props))) throw new OsgError('VERIFY_FAILED', `Invalid props ${row.row_key}`);
  return props as Record<string, unknown> | null;
}

// Resolve user selectors separately from DAG traversal, where missing parents are corruption.
export function resolveCommit(rows: GraphRow[], selector: string): string {
  if (selector === 'ROOT') return selector;
  if (!/^c[0-9a-f]{11,64}$/.test(selector)) throw new OsgError('INVALID_SCHEMA', 'Commit selector must be a full ID or a prefix of at least 12 characters');
  const matches = [...new Set(rows.filter((row) => row.row_type === 'commit' && row.commit_id?.startsWith(selector)).map((row) => row.commit_id!))];
  if (!matches.length) throw new OsgError('COMMIT_NOT_FOUND', `Commit not found: ${selector}`);
  if (matches.length > 1) throw new OsgError('INVALID_SCHEMA', `Ambiguous commit prefix: ${selector}`, { matches });
  return matches[0]!;
}

function verifiedHash(value: unknown): string {
  try { return hash(value); }
  catch (error) {
    if (!(error instanceof OsgError) || error.code !== 'INVALID_SCHEMA') throw error;
    throw new OsgError('VERIFY_FAILED', `Invalid stored canonical data: ${error.message}`);
  }
}

function elementOf(row: GraphRow): Element {
  return { element_id: row.element_id, kind: row.kind, op: row.op, status: row.status, src: row.src,
    dst: row.dst, predicate: row.predicate, extent: row.extent, props: readProps(row),
    source_hash: row.source_hash, valid_from: row.valid_from, valid_to: row.valid_to,
    observed_at: row.observed_at, supersedes: row.supersedes, content_hash: row.content_hash };
}

export function reach(commits: Map<string, GraphRow>, head: string): Set<string> {
  const found = new Set<string>();
  const pending = [head];
  while (pending.length) {
    const id = pending.pop()!;
    if (id === 'ROOT' || found.has(id)) continue;
    const row = commits.get(id);
    if (!row) throw new OsgError('VERIFY_FAILED', `Missing commit ${id}`);
    found.add(id);
    pending.push(...readParents(row));
  }
  return found;
}

export function snapshot(rows: GraphRow[], at: string, validAt: number | null = null): Snapshot {
  const commits = new Map(rows.filter((row) => row.row_type === 'commit').map((row) => [row.commit_id!, row]));
  const reachable = reach(commits, at);
  const versions = rows.filter((row) => row.row_type === 'elem' && reachable.has(row.commit_id!));
  const ending = new Map<string, number | null>();
  for (const row of versions) if (row.supersedes) {
    const prior = ending.get(row.supersedes);
    if (prior === undefined || row.valid_from == null || (prior != null && row.valid_from < prior)) ending.set(row.supersedes, row.valid_from);
  }
  const state = new Map<string, GraphRow>();
  for (const row of versions) {
    if (row.op === 'retract') continue;
    // A null closing timestamp is -infinity, not the +infinity of an absent end.
    const end = Math.min(row.valid_to ?? Infinity,
      ending.has(row.row_key) ? ending.get(row.row_key) ?? -Infinity : Infinity);
    const current = validAt == null ? end === Infinity : (row.valid_from ?? -Infinity) <= validAt && validAt < end;
    if (!current) continue;
    const previous = state.get(row.element_id);
    if (previous && previous.content_hash !== row.content_hash) throw new OsgError('STATE_CONFLICT', `Conflicting rows for ${row.element_id}`);
    state.set(row.element_id, row);
  }
  return { rows, commits, reachable, state };
}

function validate(item: Proposal): void {
  const isEdge = item.element_id.startsWith('code:edge:') || item.element_id.startsWith('agent:edge:');
  if (!idPattern.test(item.element_id) || item.element_id !== item.element_id.normalize('NFC') ||
      (isEdge ? item.element_id !== `${item.element_id.split(':')[0]}:edge:${item.predicate}|${item.src}|${item.dst}` : /[|@]/.test(item.element_id)) ||
      /%(?![0-9A-F]{2})/.test(item.element_id) || !item.kind || !['assert', 'retract'].includes(item.op) ||
      !['observed', 'hypothesis'].includes(item.status)) throw new OsgError('INVALID_SCHEMA', 'Invalid element identity or status');
  if (/^code:(?:file|symbol):/.test(item.element_id)) {
    const locator = item.element_id.slice(item.element_id.indexOf(':', 5) + 1).split('#')[0]!;
    if (!locator || locator.startsWith('/') || /^[a-z]:/i.test(locator) || locator.split('/').some((part) => !part || part === '.' || part === '..' || part.includes('\\'))) {
      throw new OsgError('INVALID_SCHEMA', 'Invalid path component');
    }
  }
  if ([item.valid_from, item.valid_to, item.observed_at].some((n) => n != null && !Number.isSafeInteger(n))) throw new OsgError('INVALID_SCHEMA', 'Unsafe timestamp');
  if (item.valid_from != null && item.valid_to != null && item.valid_from >= item.valid_to) throw new OsgError('INVALID_SCHEMA', 'Invalid interval');
  if (item.extent != null) {
    const { frame_id, t, q, ext_min, ext_max } = item.extent;
    if (frame_id == null || !idPattern.test(frame_id) || (ext_min == null) !== (ext_max == null) ||
        (ext_min && ext_max && (ext_min.length !== ext_max.length || ext_min.some((value, index) => !Number.isSafeInteger(value) || value > ext_max[index]!))) ||
        [t, q].some((values) => values?.some((value) => !Number.isSafeInteger(value)))) throw new OsgError('INVALID_SCHEMA', 'Invalid extent');
    if (frame_id.startsWith('code:file:') && (ext_min?.length !== 1 || ext_max?.length !== 1 || ext_min[0]! < 1)) throw new OsgError('INVALID_SCHEMA', 'Invalid line extent');
  }
  if ((item.src == null) !== (item.dst == null) || (item.src != null && (!item.predicate || !idPattern.test(item.src) || !idPattern.test(item.dst!)))) throw new OsgError('INVALID_DELTA', 'Invalid edge');
  canon(item.props);
}

export function prepare(open: Map<string, GraphRow>, proposed: Proposal[]): Element[] {
  const seen = new Set<string>();
  const prepared: Element[] = [];
  for (const item of proposed) {
    validate(item);
    if (seen.has(item.element_id)) throw new OsgError('INVALID_DELTA', 'Duplicate element');
    seen.add(item.element_id);
    const prior = open.get(item.element_id);
    if (prior && (prior.status === 'approved' || prior.status === 'policy')) {
      throw new OsgError('INVALID_DELTA', `Protected state cannot be replaced or retracted: ${item.element_id}`);
    }
    if (item.supersedes != null && item.supersedes !== prior?.row_key) throw new OsgError('INVALID_DELTA', 'Supersedes mismatch');
    if (!prior && item.op === 'retract') throw new OsgError('INVALID_DELTA', 'Absent retract');
    const element: Element = { ...item, supersedes: prior?.row_key ?? null, content_hash: contentHash(item as Omit<Element, 'content_hash'>) };
    if (prior && item.op === 'assert' && prior.content_hash === element.content_hash) continue;
    prepared.push(element);
  }
  const next = new Map(open);
  for (const item of prepared) {
    if (item.op === 'retract') next.delete(item.element_id);
    else next.set(item.element_id, { ...item, row_type: 'elem', row_key: '', props: null, commit_id: null } as GraphRow);
  }
  for (const row of next.values()) if (row.src && (!next.has(row.src) || !next.has(row.dst!))) throw new OsgError('INVALID_DELTA', `Dangling edge ${row.element_id}`);
  return prepared;
}

export interface CommitResult { commitId: string; noop: boolean; idempotent: boolean; count: number; }

export interface HeadView { head: string; state: Map<string, GraphRow>; commits: Map<string, GraphRow>; }

export async function commit(store: GraphPort, proposals: Proposal[], actor: string, branch = 'main', expected?: string, view?: HeadView): Promise<CommitResult> {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(branch)) throw new OsgError('INVALID_SCHEMA', 'Invalid branch');
  const head = await store.head(branch);
  if (head == null) throw new OsgError('BRANCH_NOT_FOUND', 'Branch not found');
  const parent = expected ?? head;
  if (parent !== 'ROOT' && !commitPattern.test(parent)) throw new OsgError('INVALID_SCHEMA', 'Invalid expected head');
  // Only commit rows are needed for lineage; element state comes from the caller's view when it matches the parent.
  const commits = view && view.head === parent ? view.commits : new Map((await store.commitRows()).map((row) => [row.commit_id!, row]));
  if (parent !== 'ROOT') reach(commits, parent);
  const previousState = view && view.head === parent ? view.state : snapshot(await store.rows(), parent).state;
  const elements = prepare(previousState, proposals).sort((a, b) => a.element_id < b.element_id ? -1 : a.element_id > b.element_id ? 1 : 0);
  if (!elements.length) {
    if (head !== parent) throw new OsgError('STALE_HEAD', 'Head changed');
    return { commitId: head, noop: true, idempotent: false, count: 0 };
  }
  const deltaHash = hash(elements);
  const commitId = `c${hash({ schema_version: 1, parents: [parent], branch, delta_hash: deltaHash, actor })}`;
  const generation = parent === 'ROOT' ? 1 : commits.get(parent)!.generation! + 1;
  const written = elements.map((element) => blankRow({ ...element, props: element.props == null ? null : canon(element.props),
    row_key: `${element.element_id}@${commitId}`, row_type: 'elem', commit_id: commitId }));
  written.push(blankRow({ row_key: `commit:${commitId}`, row_type: 'commit', commit_id: commitId, branch,
    parents: JSON.stringify([parent]), delta_hash: deltaHash, actor, generation,
    committed_at: Date.now() * 1000 }));
  written.push(blankRow({ row_key: `head:${branch}`, row_type: 'head', branch, head: commitId }));
  // A retry may have been published and advanced since its first acknowledgement.
  const published = async (at: string) => reach(new Map((await store.commitRows()).map((row) => [row.commit_id!, row])), at).has(commitId);
  if (head !== parent) {
    if (await published(head)) return { commitId, noop: false, idempotent: true, count: elements.length };
    throw new OsgError('STALE_HEAD', 'Head changed', { expected: parent, actual: head });
  }
  const accepted = await store.publish(written, parent);
  if (!accepted) {
    const latest = await store.head(branch);
    if (latest && await published(latest)) return { commitId, noop: false, idempotent: true, count: elements.length };
    throw new OsgError('STALE_HEAD', 'Head changed', { expected: parent, actual: latest });
  }
  return { commitId, noop: false, idempotent: false, count: elements.length };
}

interface Tracked { state: Map<string, GraphRow>; degree: Map<string, number>; }

function cloneTracked(source: Tracked): Tracked { return { state: new Map(source.state), degree: new Map(source.degree) }; }

export function verify(rows: GraphRow[], selector?: string): { commits: number; elements: number } {
  const keys = new Set<string>();
  const byCommit = new Map<string, GraphRow[]>();
  for (const row of rows) {
    if (keys.has(row.row_key)) throw new OsgError('VERIFY_FAILED', `Duplicate row ${row.row_key}`);
    keys.add(row.row_key);
    if (row.row_type === 'elem' && row.commit_id) { const list = byCommit.get(row.commit_id); if (list) list.push(row); else byCommit.set(row.commit_id, [row]); }
  }
  const commits = new Map(rows.filter((row) => row.row_type === 'commit').map((row) => [row.commit_id!, row]));
  const visited = new Set<string>();
  const heads = selector === undefined ? rows.filter((row) => row.row_type === 'head').map((row) => row.head!) : [resolveCommit(rows, selector)];
  for (const head of heads) for (const id of reach(commits, head)) visited.add(id);
  const children = new Map<string, number>();
  for (const id of visited) for (const parent of readParents(commits.get(id)!)) children.set(parent, (children.get(parent) ?? 0) + 1);
  // States are carried along single-parent chains and mutated in place when only one child needs them,
  // so verification is linear in history instead of replaying a snapshot per commit.
  const tracked = new Map<string, Tracked>();
  const ordered = [...visited].sort((a, b) => (commits.get(a)!.generation ?? 0) - (commits.get(b)!.generation ?? 0));
  const isEdge = (row: GraphRow) => row.src != null;
  let elements = 0;
  for (const id of ordered) {
    const row = commits.get(id)!;
    const parents = readParents(row);
    if (parents.includes(id) || parents.includes('ROOT') && parents.length !== 1) throw new OsgError('VERIFY_FAILED', `Invalid parents ${id}`);
    if (!parents.length || parents.some((parent) => parent !== 'ROOT' && !commits.has(parent)) ||
        row.generation !== Math.max(0, ...parents.filter((parent) => parent !== 'ROOT').map((parent) => commits.get(parent)!.generation!)) + 1) throw new OsgError('VERIFY_FAILED', `Invalid ancestry ${id}`);
    const deltaRows = byCommit.get(id) ?? [];
    const content = deltaRows.slice()
      .sort((a, b) => a.element_id < b.element_id ? -1 : a.element_id > b.element_id ? 1 : 0).map((element) => {
        const decoded = elementOf(element);
        const { element_id, kind, op, status, src, dst, predicate, extent, props, source_hash } = decoded;
        if (element.row_key !== `${element.element_id}@${id}` || element.content_hash !== verifiedHash({ element_id, kind, op, status, src, dst, predicate, extent, props, source_hash })) throw new OsgError('VERIFY_FAILED', `Invalid element ${element.row_key}`);
        elements++;
        return decoded;
      });
    if (row.row_key !== `commit:${id}` || verifiedHash(content) !== row.delta_hash ||
        `c${verifiedHash({ schema_version: 1, parents, branch: row.branch, delta_hash: row.delta_hash, actor: row.actor })}` !== id) {
      throw new OsgError('VERIFY_FAILED', `Invalid commit ${id}`);
    }
    const parentId = parents[0]!;
    const fast = parents.length === 1 && deltaRows.every((element) => element.valid_to == null) && (parentId === 'ROOT' || tracked.has(parentId));
    if (fast) {
      let before: Tracked;
      if (parentId === 'ROOT') before = { state: new Map(), degree: new Map() };
      else if (children.get(parentId) === 1) { before = tracked.get(parentId)!; tracked.delete(parentId); }
      else before = cloneTracked(tracked.get(parentId)!);
      const retired: string[] = [];
      const added: GraphRow[] = [];
      for (const element of deltaRows) {
        const prior = before.state.get(element.element_id);
        if (element.supersedes !== (prior?.row_key ?? null) || (element.op === 'retract' && !prior)) throw new OsgError('VERIFY_FAILED', `Invalid supersedes ${element.row_key}`);
      }
      for (const element of deltaRows) {
        const prior = before.state.get(element.element_id);
        if (prior && isEdge(prior)) for (const end of [prior.src!, prior.dst!]) before.degree.set(end, (before.degree.get(end) ?? 1) - 1);
        if (element.op === 'retract') { before.state.delete(element.element_id); retired.push(element.element_id); }
        else {
          before.state.set(element.element_id, element); added.push(element);
          if (isEdge(element)) for (const end of [element.src!, element.dst!]) before.degree.set(end, (before.degree.get(end) ?? 0) + 1);
        }
      }
      for (const element of added) if (isEdge(element) && (!before.state.has(element.src!) || !before.state.has(element.dst!))) {
        throw new OsgError('VERIFY_FAILED', `Dangling edge ${element.row_key}`);
      }
      for (const gone of retired) if ((before.degree.get(gone) ?? 0) > 0 && !before.state.has(gone)) throw new OsgError('VERIFY_FAILED', `Dangling edge to ${gone}`);
      tracked.set(id, before);
    } else {
      const before = snapshot(rows, parentId);
      const next = new Map(before.state);
      for (const element of deltaRows) {
        if (element.supersedes !== (before.state.get(element.element_id)?.row_key ?? null) ||
            (element.op === 'retract' && !before.state.has(element.element_id))) throw new OsgError('VERIFY_FAILED', `Invalid supersedes ${element.row_key}`);
        if (element.op === 'retract') next.delete(element.element_id);
        else next.set(element.element_id, element);
      }
      for (const element of next.values()) if (element.src && (!next.has(element.src) || !next.has(element.dst!))) {
        throw new OsgError('VERIFY_FAILED', `Dangling edge ${element.row_key}`);
      }
    }
  }
  return { commits: visited.size, elements };
}
