import { OsgError, type GraphPort, type GraphRow } from '../../contracts/src/index.js';
import { hash } from './hash.js';
import { commit, resolveCommit, snapshot, type Proposal } from './graph.js';

const actor = 'provider-tsc@0.1.0';
const agentActor = 'agent:cli';
const observed = () => Date.now() * 1000;
const attempts = 4; // Initial attempt plus three stale-head retries (spec §10.9).
// Random backoff so concurrent writers do not collide again in lockstep.
const pause = () => new Promise<void>((done) => setTimeout(done, 50 + Math.random() * 200));

// Episode claims may retire only other hypotheses, never provider or owner authority.
function isHypothesisEpisode(row: GraphRow | undefined): row is GraphRow {
  return row?.kind === 'episode' && row.status === 'hypothesis';
}

export async function sync(store: GraphPort, extract: () => Promise<{ facts: Proposal[]; warnings: { code: string; message: string }[]; files: number }>) {
  for (let retry = 0; retry < attempts; retry++) {
    const current = await store.head('main');
    if (current == null) throw new OsgError('NOT_INITIALIZED', 'Graph is not initialized');
    const state = snapshot(await store.rows(), current).state;
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
    try {
      const result = await commit(store, proposals, actor, 'main', current);
      return { ...result, files, warnings };
    } catch (error) {
      if (!(error instanceof OsgError) || error.code !== 'STALE_HEAD' || retry === attempts - 1) throw error;
      await pause();
    }
  }
  throw new OsgError('STALE_HEAD', 'Exhausted retries');
}

export async function remember(store: GraphPort, task: string, decision: string, outcome: string, entities: string[], supersedes: string[] = []) {
  if (![task, decision, outcome].every((value) => value.trim().length > 0 && value.length <= 16384)) throw new OsgError('USAGE', 'Task, decision and outcome are required (max 16384 characters)');
  for (let retry = 0; retry < attempts; retry++) {
    const head = await store.head('main');
    if (head == null) throw new OsgError('NOT_INITIALIZED', 'Graph is not initialized');
    const state = snapshot(await store.rows(), head).state;
    const warnings: { code: string; message: string }[] = [
      { code: 'POLICY_REFS_UNAVAILABLE', message: 'Host-loaded rules could not be verified; no rule hash was recorded.' }
    ];
    const resolved = [...new Set(entities.flatMap((name) => {
      const match = state.has(name) ? [name] : [...state.values()].filter((row) => row.element_id === name || JSON.parse(row.props ?? '{}').name === name).map((row) => row.element_id);
      if (match.length !== 1) { warnings.push({ code: 'UNRESOLVED_ENTITY', message: name }); return []; }
      return match;
    }))].sort();
    const retired = [...new Set(supersedes.filter((id) => {
      if (isHypothesisEpisode(state.get(id))) return true;
      warnings.push({ code: 'UNRESOLVED_SUPERSEDES', message: id });
      return false;
    }))].sort();
    const time = observed();
    const episodeId = `agent:episode:${hash({ task, decision, outcome, entities: resolved, ...(retired.length ? { supersedes: retired } : {}), actor: agentActor, observed_at: time }).slice(0, 24)}`;
    const episode: Proposal = { element_id: episodeId, kind: 'episode', op: 'assert', status: 'hypothesis',
      src: null, dst: null, predicate: null, extent: null,
      props: { task, decision, outcome, entities: resolved, policy_refs: [], ...(retired.length ? { supersedes: retired } : {}) }, source_hash: null,
      valid_from: time, valid_to: null, observed_at: time };
    const edges: Proposal[] = resolved.map((id) => ({ element_id: `agent:edge:about|${episodeId}|${id}`,
      kind: 'about', op: 'assert', status: 'hypothesis', src: episodeId, dst: id, predicate: 'about',
      extent: null, props: null, source_hash: null, valid_from: time, valid_to: null, observed_at: time }));
    try { return { ...(await commit(store, [episode, ...edges], agentActor, 'main', head)), episodeId, warnings }; }
    catch (error) { if (!(error instanceof OsgError) || error.code !== 'STALE_HEAD' || retry === attempts - 1) throw error; await pause(); }
  }
  throw new OsgError('STALE_HEAD', 'Exhausted retries');
}

export interface ContextItem { elementId: string; kind: string; provenance: { status: string; actor: string | null; commitId: string; observedAt: string | null; supersededBy: string | null }; citation: { path: string; startLine: number; endLine: number; sourceHash: string | null; stale: boolean } | null; data: { untrusted: true; value: Record<string, unknown> }; }

export async function context(store: GraphPort, query: string, maxTokens: number,
  stale: (path: string, sourceHash: string | null) => Promise<boolean>, entity?: string) {
  const head = await store.head('main');
  if (head == null) throw new OsgError('NOT_INITIALIZED', 'Graph is not initialized');
  const view = snapshot(await store.rows(), head);
  const tokens = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 2);
  // Score each row once: the comparator below runs O(n log n) times and parsing props there dominated query time.
  const scores = new Map<string, number>();
  const score = (row: GraphRow) => {
    let value = scores.get(row.row_key);
    if (value === undefined) {
      const props = JSON.parse(row.props ?? '{}') as Record<string, unknown>;
      const text = `${row.element_id} ${props.name ?? ''} ${props.path ?? ''} ${props.task ?? ''} ${props.decision ?? ''} ${props.outcome ?? ''} ${row.kind}`.toLowerCase();
      value = entity === row.element_id ? 100 : tokens.reduce((count, token) => count + (text.includes(token) ? 1 : 0), 0);
      scores.set(row.row_key, value);
    }
    return value;
  };
  const newest = (a: GraphRow, b: GraphRow) => (b.observed_at ?? 0) - (a.observed_at ?? 0);
  // Entity mode asks about one known element: do not score its id tokens (`code`, `symbol`, `src`) against everything.
  const seeds = entity !== undefined
    ? [...view.state.values()].filter((row) => row.element_id === entity && !row.src)
    : [...view.state.values()].filter((row) => !row.src && score(row) > 0)
      .sort((a, b) => score(b) - score(a) || newest(a, b) || (a.element_id < b.element_id ? -1 : 1));
  const related = new Set(seeds.map((row) => row.element_id));
  for (let depth = 0; depth < 2; depth++) for (const row of view.state.values()) {
    if (row.src && (related.has(row.src) || related.has(row.dst!))) { related.add(row.src); related.add(row.dst!); }
  }
  const direct = new Set(entity === undefined ? [] : [...view.state.values()].filter((row) => row.kind === 'about' && row.dst === entity).map((row) => row.src!));
  const seeded = new Set(seeds);
  const rest = [...view.state.values()].filter((row) => related.has(row.element_id) && !seeded.has(row) && row.kind !== 'about')
    .sort((a, b) => Number(direct.has(b.element_id)) - Number(direct.has(a.element_id)) || (a.kind === 'episode' && b.kind === 'episode' ? newest(a, b) : 0));
  // Stored claims are untrusted: only live hypothesis episodes may retire one another.
  const supersededBy = new Map<string, string>();
  for (const row of [...view.state.values()].filter(isHypothesisEpisode).sort(newest).reverse()) {
    const list = (JSON.parse(row.props ?? '{}') as { supersedes?: unknown }).supersedes;
    if (Array.isArray(list)) for (const id of list) {
      if (typeof id === 'string' && id !== row.element_id && isHypothesisEpisode(view.state.get(id))) {
        supersededBy.set(id, row.element_id);
      }
    }
  }
  const results = [...seeds, ...rest].sort((a, b) => Number(supersededBy.has(a.element_id)) - Number(supersededBy.has(b.element_id)));
  const items: ContextItem[] = [];
  // The entire payload, including provenance, is charged against the configured budget.
  const budget = maxTokens * 4;
  // Running serialized size; identical to stringifying the whole packet per candidate, without the quadratic cost.
  let used = JSON.stringify({ items: [], graphCommitId: head }).length;
  for (const row of results) {
    const props = JSON.parse(row.props ?? '{}') as Record<string, unknown>;
    const located = typeof props.path === 'string' && row.extent?.ext_min?.[0] != null && row.extent.ext_max?.[0] != null;
    const build = (isStale: boolean): ContextItem => ({ elementId: row.element_id, kind: row.kind,
      provenance: { status: row.status, actor: view.commits.get(row.commit_id!)?.actor ?? null, commitId: row.commit_id!,
        observedAt: row.observed_at == null ? null : new Date(row.observed_at / 1000).toISOString(), supersededBy: supersededBy.get(row.element_id) ?? null },
      citation: located ? { path: props.path as string, startLine: row.extent!.ext_min![0]!, endLine: row.extent!.ext_max![0]!, sourceHash: row.source_hash, stale: isStale } : null,
      data: { untrusted: true, value: props } });
    const fits = (item: ContextItem) => used + JSON.stringify(item).length + items.length <= budget;
    // `false` serializes shorter than `true`: if even that does not fit, skip the file read.
    if (!fits(build(false))) continue;
    const item = build(located ? await stale(props.path as string, row.source_hash) : false);
    if (!fits(item)) continue;
    used += JSON.stringify(item).length;
    items.push(item);
  }
  return { graphCommitId: head, items, estimatedTokens: Math.ceil(JSON.stringify({ items, graphCommitId: head }).length / 4), maxTokens };
}

export async function history(store: GraphPort, entity: string, commitId?: string) {
  const storedRows = await store.rows();
  const head = commitId === undefined ? await store.head('main') : resolveCommit(storedRows, commitId);
  if (head == null) throw new OsgError('NOT_INITIALIZED', 'Graph is not initialized');
  const view = snapshot(storedRows, head);
  const rows = view.rows.filter((row) => row.row_type === 'elem' && view.reachable.has(row.commit_id!) && row.element_id === entity)
    .sort((a, b) => view.commits.get(a.commit_id!)!.generation! - view.commits.get(b.commit_id!)!.generation!);
  return { graphCommitId: head, entityId: entity, current: view.state.has(entity), versions: rows.map((row) => ({
    rowKey: row.row_key, commitId: row.commit_id, operation: row.op, supersedes: row.supersedes,
    contentHash: row.content_hash, props: { untrusted: true, value: JSON.parse(row.props ?? '{}') as Record<string, unknown> }
  })) };
}
