import { OsgError, type GraphPort, type GraphRow } from '../../contracts/src/index.js';
import { hash } from './hash.js';
import { commit, resolveCommit, snapshot, type Proposal } from './graph.js';
import { headView, type StateCache } from './state.js';
const append = <K, V>(map: Map<K, V[]>, key: K, value: V) => { const list = map.get(key); if (list) list.push(value); else map.set(key, [value]); };

const actor = 'provider-tsc@0.1.0';
const agentActor = 'agent:cli';
const observed = () => Date.now() * 1000;
const attempts = 4;
// Random backoff so concurrent writers do not collide again in lockstep.
const pause = () => new Promise<void>((done) => setTimeout(done, 50 + Math.random() * 200));

export interface SyncOptions { cache?: StateCache; /** Compute what would change and stop before writing. */ dryRun?: boolean; }

/** Identity of a symbol for the legacy relink: its file and last name segment, with escaped dots decoded. */
const bareName = (name: unknown): string => String(name ?? '').replace(/%2E/gi, '.').split('.').pop()!;
const legacyLanguage = /\.(?:py|go|rs|java)$/i;

type Extract = () => Promise<{ facts: Proposal[]; warnings: { code: string; message: string }[]; files: number }>;
type Warnings = { code: string; message: string }[];
export interface SyncPlan { dryRun: true; files: number; warnings: Warnings; renamed: number; retired: number; added: number; proposals: number; }
export type SyncResult = Awaited<ReturnType<typeof commit>> & { files: number; warnings: Warnings; renamed: number };
export async function sync(store: GraphPort, extract: Extract, options: SyncOptions & { dryRun: true }): Promise<SyncPlan>;
export async function sync(store: GraphPort, extract: Extract, options?: SyncOptions & { dryRun?: false }): Promise<SyncResult>;
export async function sync(store: GraphPort, extract: Extract, options: SyncOptions = {}): Promise<SyncPlan | SyncResult> {
  for (let retry = 0; retry < attempts; retry++) {
    const view = await headView(store, options.cache);
    const state = view.state;
    const { facts, warnings, files } = await extract();
    const desired = new Map(facts.map((fact) => [fact.element_id, fact]));
    for (const fact of facts) if (fact.src && (!desired.has(fact.src) || !desired.has(fact.dst!))) {
      throw new OsgError('INVALID_DELTA', `Unresolved provider edge ${fact.element_id}`);
    }
    if (desired.size !== facts.length) throw new OsgError('INVALID_SCHEMA', 'Ambiguous extracted identity');
    const proposals = [...facts];
    const removed = new Set([...state.values()].filter((row) => (row.element_id.startsWith('code:') || row.element_id.startsWith('doc:')) && !desired.has(row.element_id)).map((row) => row.element_id));
    for (const row of state.values()) if (removed.has(row.element_id) || (row.kind === 'about' && removed.has(row.dst!))) {
      proposals.push({ element_id: row.element_id, kind: row.kind, op: 'retract', status: row.status, src: row.src,
        dst: row.dst, predicate: row.predicate, extent: null, props: null, source_hash: null,
        valid_from: observed(), valid_to: null, observed_at: observed() });
    }
    // A symbol that disappears while exactly one new symbol appears with the same body digest was renamed:
    // carry its episode links to the new identity (the old identity keeps its history).
    const digest = (props: Record<string, unknown> | null) => typeof props?.bodyHash === 'string' ? props.bodyHash : null;
    const gone = new Map<string, string[]>();
    for (const id of removed) {
      const row = state.get(id);
      const key = row && !row.src && row.kind !== 'file' ? digest(JSON.parse(row.props ?? '{}')) : null;
      if (key) append(gone, key, id);
    }
    const fresh = new Map<string, string[]>();
    for (const fact of facts) {
      const key = !fact.src && !state.has(fact.element_id) ? digest(fact.props) : null;
      if (key) append(fresh, key, fact.element_id);
    }
    const renames = new Map<string, string>();
    for (const [key, olds] of gone) { const news = fresh.get(key); if (olds.length === 1 && news?.length === 1) renames.set(olds[0]!, news[0]!); }
    // Symbols written by the line-based parser for Python, Go, Rust and Java carry no body digest, and their qualified
    // names were encoded differently. Within one file, a single vanished and a single new symbol with the same last
    // name segment are the same symbol under the Tree-sitter identity scheme.
    const legacyGone = new Map<string, string[]>();
    for (const id of removed) {
      const row = state.get(id);
      if (!row || row.src || renames.has(id)) continue;
      const props = JSON.parse(row.props ?? '{}') as { path?: string; name?: string; bodyHash?: string };
      if (props.bodyHash || row.kind === 'file' || typeof props.path !== 'string' || !legacyLanguage.test(props.path)) continue;
      append(legacyGone, `${props.path}\0${bareName(props.name)}`, id);
    }
    const legacyFresh = new Map<string, string[]>();
    const taken = new Set(renames.values());
    for (const fact of facts) {
      if (fact.src || state.has(fact.element_id) || taken.has(fact.element_id)) continue;
      const props = fact.props as { path?: string; name?: string } | null;
      if (!props || typeof props.path !== 'string' || !legacyLanguage.test(props.path)) continue;
      append(legacyFresh, `${props.path}\0${bareName(props.name)}`, fact.element_id);
    }
    for (const [key, olds] of legacyGone) { const news = legacyFresh.get(key); if (olds.length === 1 && news?.length === 1) renames.set(olds[0]!, news[0]!); }
    for (const row of state.values()) if (row.kind === 'about' && renames.has(row.dst!) && !removed.has(row.src!)) {
      const to = renames.get(row.dst!)!;
      const time = observed();
      proposals.push({ element_id: `agent:edge:about|${row.src}|${to}`, kind: 'about', op: 'assert', status: 'hypothesis', src: row.src, dst: to,
        predicate: 'about', extent: null, props: null, source_hash: null, valid_from: time, valid_to: null, observed_at: time });
    }
    if (options.dryRun) {
      const added = facts.filter((fact) => !fact.src && !state.has(fact.element_id)).length;
      return { dryRun: true as const, files, warnings, renamed: renames.size, retired: [...removed].filter((id) => !state.get(id)?.src).length, added, proposals: proposals.length };
    }
    try {
      const result = await commit(store, proposals, actor, 'main', view.head, view);
      return { ...result, files, warnings, renamed: renames.size };
    } catch (error) {
      if (!(error instanceof OsgError) || error.code !== 'STALE_HEAD' || retry === attempts - 1) throw error;
      await pause();
    }
  }
  throw new OsgError('STALE_HEAD', 'Exhausted retries');
}

const secretPatterns: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[REDACTED:private-key]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED:aws-key]'],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g, '[REDACTED:github-token]'],
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/g, '[REDACTED:api-key]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[REDACTED:slack-token]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, '[REDACTED:jwt]'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g, 'Bearer [REDACTED:token]'],
  [/(:\/\/[^/\s:@]+:)[^/\s@]+@/g, '$1[REDACTED:password]@'],
  [/\b((?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\s*[:=]\s*)(?:"[^"]+"|'[^']+'|[^\s,;]+)/gi, '$1[REDACTED:secret]']
];

/** History is permanent, so obvious credentials never reach the graph. Returns the cleaned text and whether anything changed. */
export function redact(text: string): { text: string; changed: boolean } {
  let out = text;
  for (const [pattern, replacement] of secretPatterns) out = out.replace(pattern, replacement);
  return { text: out, changed: out !== text };
}

export interface RememberOptions {
  supersedes?: string[];
  tags?: string[];
  cache?: StateCache;
  git?: { branch: string | null; revision: string | null } | null;
}

export async function remember(store: GraphPort, task: string, decision: string, outcome: string, entities: string[], options: RememberOptions = {}) {
  if (![task, decision, outcome].every((value) => value.trim().length > 0 && value.length <= 16384)) throw new OsgError('USAGE', 'Task, decision and outcome are required (max 16384 characters)');
  const cleaned = [task, decision, outcome, ...(options.tags ?? [])].map(redact);
  const [cleanTask, cleanDecision, cleanOutcome] = cleaned.map((entry) => entry.text) as [string, string, string];
  const tags = [...new Set(cleaned.slice(3).map((entry) => entry.text.trim().slice(0, 64)).filter(Boolean))].sort().slice(0, 12);
  for (let retry = 0; retry < attempts; retry++) {
    const view = await headView(store, options.cache);
    const state = view.state;
    const warnings: { code: string; message: string }[] = [
      { code: 'POLICY_REFS_UNAVAILABLE', message: 'Host-loaded rules could not be verified; no rule hash was recorded.' }
    ];
    if (cleaned.some((entry) => entry.changed)) warnings.push({ code: 'SECRET_REDACTED', message: 'Credential-like text was removed before saving.' });
    const resolved = [...new Set(entities.flatMap((name) => {
      const match = state.has(name) ? [name] : [...state.values()].filter((row) => !row.src && (row.element_id === name || JSON.parse(row.props ?? '{}').name === name)).map((row) => row.element_id);
      if (match.length !== 1) { warnings.push({ code: 'UNRESOLVED_ENTITY', message: name }); return []; }
      return match;
    }))].sort();
    const retired = [...new Set((options.supersedes ?? []).filter((id) => {
      const target = state.get(id);
      if (target?.kind === 'episode' && target.status === 'hypothesis' && target.op === 'assert' && !target.src) return true;
      warnings.push({ code: 'UNRESOLVED_SUPERSEDES', message: id });
      return false;
    }))].sort();
    // Anchors record what the code looked like when the decision was made, so later drift can be flagged.
    const anchors = resolved.map((entity) => {
      const row = state.get(entity)!;
      const body = (JSON.parse(row.props ?? '{}') as { bodyHash?: unknown }).bodyHash;
      return { entity, sourceHash: row.source_hash, bodyHash: typeof body === 'string' ? body : null };
    }).filter((anchor) => anchor.sourceHash || anchor.bodyHash);
    const time = observed();
    const git = options.git && (options.git.branch || options.git.revision) ? { branch: options.git.branch, revision: options.git.revision } : null;
    const body = {
      task: cleanTask, decision: cleanDecision, outcome: cleanOutcome, entities: resolved, policy_refs: [] as string[],
      ...(retired.length ? { supersedes: retired } : {}), ...(tags.length ? { tags } : {}),
      ...(anchors.length ? { anchors } : {}), ...(git ? { git } : {})
    };
    const episodeId = `agent:episode:${hash({ ...body, actor: agentActor, observed_at: time }).slice(0, 24)}`;
    const episode: Proposal = { element_id: episodeId, kind: 'episode', op: 'assert', status: 'hypothesis',
      src: null, dst: null, predicate: null, extent: null, props: body, source_hash: null,
      valid_from: time, valid_to: null, observed_at: time };
    const link = (kind: string, to: string): Proposal => ({ element_id: `agent:edge:${kind}|${episodeId}|${to}`,
      kind, op: 'assert', status: 'hypothesis', src: episodeId, dst: to, predicate: kind,
      extent: null, props: null, source_hash: null, valid_from: time, valid_to: null, observed_at: time });
    const edges: Proposal[] = [...resolved.map((id) => link('about', id)), ...retired.map((id) => link('supersedes', id))];
    try { return { ...(await commit(store, [episode, ...edges], agentActor, 'main', view.head, view)), episodeId, warnings, linked: resolved.length }; }
    catch (error) { if (!(error instanceof OsgError) || error.code !== 'STALE_HEAD' || retry === attempts - 1) throw error; await pause(); }
  }
  throw new OsgError('STALE_HEAD', 'Exhausted retries');
}

export async function history(store: GraphPort, entity: string, commitId?: string) {
  const commitRows = await store.commitRows();
  const head = commitId === undefined ? await store.head('main') : resolveCommit(commitRows, commitId);
  if (head == null) throw new OsgError('NOT_INITIALIZED', 'Graph is not initialized');
  // Only this element's rows plus the commit rows are needed, never the whole table.
  const view = snapshot([...commitRows, ...await store.rowsOfElement(entity)], head);
  const rows = view.rows.filter((row) => row.row_type === 'elem' && view.reachable.has(row.commit_id!) && row.element_id === entity)
    .sort((a, b) => view.commits.get(a.commit_id!)!.generation! - view.commits.get(b.commit_id!)!.generation!);
  return { graphCommitId: head, entityId: entity, current: view.state.has(entity), versions: rows.map((row) => ({
    rowKey: row.row_key, commitId: row.commit_id, operation: row.op, supersedes: row.supersedes,
    contentHash: row.content_hash, props: { untrusted: true, value: JSON.parse(row.props ?? '{}') as Record<string, unknown> }
  })) };
}

/** What changed in the graph between two commits (ids or prefixes; `ROOT` is the empty graph). */
export async function diff(store: GraphPort, from: string, to: string) {
  const rows = await store.rows();
  const a = resolveCommit(rows, from);
  const b = resolveCommit(rows, to);
  const before = snapshot(rows, a).state;
  const after = snapshot(rows, b).state;
  const added: string[] = [], removed: string[] = [], changed: string[] = [];
  let edgesAdded = 0, edgesRemoved = 0, edgesChanged = 0;
  for (const [id, row] of after) {
    const prior = before.get(id);
    if (!prior) { if (row.src) edgesAdded++; else added.push(id); }
    else if (prior.content_hash !== row.content_hash) { if (row.src) edgesChanged++; else changed.push(id); }
  }
  for (const [id, row] of before) if (!after.has(id)) { if (row.src) edgesRemoved++; else removed.push(id); }
  const cap = (list: string[]) => ({ count: list.length, ids: list.sort().slice(0, 100), truncated: list.length > 100 });
  return { from: a, to: b, added: cap(added), removed: cap(removed), changed: cap(changed), edges: { added: edgesAdded, removed: edgesRemoved, changed: edgesChanged } };
}
