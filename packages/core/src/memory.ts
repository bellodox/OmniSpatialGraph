import { OsgError, type GraphPort, type GraphRow } from '../../contracts/src/index.js';
import { hash } from './hash.js';
import { commit, resolveCommit, snapshot, type Proposal } from './graph.js';

const actor = 'provider-tsc@0.1.0';
const agentActor = 'agent:cli';
const observed = () => Date.now() * 1000;

export async function sync(store: GraphPort, extract: () => Promise<{ facts: Proposal[]; warnings: { code: string; message: string }[]; files: number }>) {
  for (let retry = 0; retry < 4; retry++) {
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
      if (!(error instanceof OsgError) || error.code !== 'STALE_HEAD' || retry === 3) throw error;
    }
  }
  throw new OsgError('STALE_HEAD', 'Exhausted retries');
}

export async function remember(store: GraphPort, task: string, decision: string, outcome: string, entities: string[]) {
  if (![task, decision, outcome].every((value) => value.trim().length > 0 && value.length <= 16384)) throw new OsgError('USAGE', 'Task, decision and outcome are required (max 16384 characters)');
  for (let retry = 0; retry < 4; retry++) {
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
    const time = observed();
    const episodeId = `agent:episode:${hash({ task, decision, outcome, entities: resolved, actor: agentActor, observed_at: time }).slice(0, 24)}`;
    const episode: Proposal = { element_id: episodeId, kind: 'episode', op: 'assert', status: 'hypothesis',
      src: null, dst: null, predicate: null, extent: null,
      props: { task, decision, outcome, entities: resolved, policy_refs: [] }, source_hash: null,
      valid_from: time, valid_to: null, observed_at: time };
    const edges: Proposal[] = resolved.map((id) => ({ element_id: `agent:edge:about|${episodeId}|${id}`,
      kind: 'about', op: 'assert', status: 'hypothesis', src: episodeId, dst: id, predicate: 'about',
      extent: null, props: null, source_hash: null, valid_from: time, valid_to: null, observed_at: time }));
    try { return { ...(await commit(store, [episode, ...edges], agentActor, 'main', head)), episodeId, warnings }; }
    catch (error) { if (!(error instanceof OsgError) || error.code !== 'STALE_HEAD' || retry === 3) throw error; }
  }
  throw new OsgError('STALE_HEAD', 'Exhausted retries');
}

export interface ContextItem { elementId: string; kind: string; provenance: { status: string; actor: string | null; commitId: string }; citation: { path: string; startLine: number; endLine: number; sourceHash: string | null; stale: boolean } | null; data: { untrusted: true; value: Record<string, unknown> }; }

export async function context(store: GraphPort, query: string, maxTokens: number,
  stale: (path: string, sourceHash: string | null) => Promise<boolean>, entity?: string) {
  const head = await store.head('main');
  if (head == null) throw new OsgError('NOT_INITIALIZED', 'Graph is not initialized');
  const view = snapshot(await store.rows(), head);
  const tokens = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 2);
  const score = (row: GraphRow) => {
    const props = JSON.parse(row.props ?? '{}') as Record<string, unknown>;
    const text = `${row.element_id} ${props.name ?? ''} ${props.path ?? ''} ${props.task ?? ''} ${props.decision ?? ''} ${props.outcome ?? ''} ${row.kind}`.toLowerCase();
    return entity === row.element_id ? 100 : tokens.reduce((count, token) => count + (text.includes(token) ? 1 : 0), 0);
  };
  const seeds = [...view.state.values()].filter((row) => !row.src && score(row) > 0)
    .sort((a, b) => score(b) - score(a) || (a.element_id < b.element_id ? -1 : 1));
  const related = new Set(seeds.map((row) => row.element_id));
  for (let depth = 0; depth < 2; depth++) for (const row of view.state.values()) {
    if (row.src && (related.has(row.src) || related.has(row.dst!))) { related.add(row.src); related.add(row.dst!); }
  }
  const results = [...seeds, ...[...view.state.values()].filter((row) => related.has(row.element_id) && !seeds.includes(row) && row.kind !== 'about')];
  const items: ContextItem[] = [];
  // The entire payload, including provenance, is charged against the configured budget.
  const budget = maxTokens * 4;
  for (const row of results) {
    const props = JSON.parse(row.props ?? '{}') as Record<string, unknown>;
    const citation = typeof props.path === 'string' && row.extent?.ext_min?.[0] != null && row.extent.ext_max?.[0] != null
      ? { path: props.path, startLine: row.extent.ext_min[0], endLine: row.extent.ext_max[0], sourceHash: row.source_hash,
        stale: await stale(props.path, row.source_hash) } : null;
    const item: ContextItem = { elementId: row.element_id, kind: row.kind,
      provenance: { status: row.status, actor: view.commits.get(row.commit_id!)?.actor ?? null, commitId: row.commit_id! },
      citation, data: { untrusted: true, value: props } };
    if (JSON.stringify({ items: [...items, item], graphCommitId: head }).length > budget) continue;
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
