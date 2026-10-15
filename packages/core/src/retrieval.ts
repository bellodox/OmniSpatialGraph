import { OsgError, type GraphPort, type GraphRow } from '../../contracts/src/index.js';
import { resolveCommit, snapshot, type HeadView } from './graph.js';
import { headView, type StateCache } from './state.js';
import { embeddableText, nearest, textDigest, type QueryVectors } from './embedding.js';
const append = <K, V>(map: Map<K, V[]>, key: K, value: V) => { const list = map.get(key); if (list) list.push(value); else map.set(key, [value]); };

const stopwords = new Set(('a an and are as at be but by can could did do does for from had has have how i if in into is it its me my of on or our should so that the their ' +
  'them then there these they this to up us was we were what when where which who why will with would you your about need needs want fix how').split(' '));
const day = 86_400_000;

/** Lowercase word pieces: camelCase, snake_case, kebab-case and paths split; the joined identifier is kept too. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.normalize('NFC').split(/[^\p{L}\p{N}_$]+/u)) {
    if (!raw) continue;
    const whole = raw.toLowerCase().replace(/[_$]/g, '');
    const pieces = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[\s_$]+/).map((piece) => piece.toLowerCase()).filter(Boolean);
    if (pieces.length > 1 && whole.length > 2) out.push(stem(whole));
    for (const piece of pieces) if (piece.length > 1 && !stopwords.has(piece)) out.push(stem(piece));
  }
  return out;
}

/** Deliberately light: collapses plural and common verb endings so "hashing" and "hash" meet. */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

interface Doc { row: GraphRow; props: Record<string, unknown>; tokens: string[]; }
const edgeWeight: Record<string, number> = { about: 1, calls: 0.7, tests: 0.7, contains: 0.6, imports: 0.5, mentions: 0.5, supersedes: 0.3 };
const weightOf = (row: GraphRow): number => {
  if (row.kind === 'cochange') {
    const weight = Number((JSON.parse(row.props ?? '{}') as { weight?: number }).weight ?? 1);
    return 0.15 + 0.1 * Math.min(4, Math.max(1, weight));
  }
  return edgeWeight[row.kind] ?? 0.3;
};

export interface ContextItem {
  elementId: string; kind: string;
  provenance: {
    status: string; actor: string | null; commitId: string; observedAt: string | null; supersededBy?: string;
    newerOnSameEntity?: string[]; anchors?: 'ok' | 'changed' | 'missing';
    git?: { branch: string | null; revision: string | null; otherBranch: boolean };
  };
  reason: { via?: string; edge?: string | null; hops: number; score: number; seed?: 'keyword' | 'meaning' | 'both' };
  citation: { path: string; startLine: number; endLine: number; sourceHash: string | null; stale: boolean } | null;
  snippet?: { untrusted: true; value: string };
  data: { untrusted: true; value: Record<string, unknown> };
}

export interface ContextOptions {
  cache?: StateCache;
  /** Answer from the graph as it was at this commit (id or prefix of at least 12 characters). */
  atCommit?: string;
  /** Valid-time read: facts that were true at this instant, in microseconds since the epoch. */
  atTime?: number;
  /** Return up to a dozen source lines for cited items that are still fresh. */
  source?: (path: string, startLine: number, endLine: number) => Promise<string | null>;
  currentBranch?: string | null;
  now?: number;
  /** Optional meaning-based candidates. Used only for task queries; the keyword search runs either way. */
  vectors?: QueryVectors;
}

/** Cosine similarity below which a vector match is ignored. A starting value; tune it against recall measurements. */
export const minSimilarity = 0.35;

const propsOf = (row: GraphRow) => JSON.parse(row.props ?? '{}') as Record<string, unknown>;

export async function context(store: GraphPort, query: string, maxTokens: number,
  stale: (path: string, sourceHash: string | null) => Promise<boolean>, entity?: string, options: ContextOptions = {}) {
  let view: HeadView;
  let asOf: { commitId?: string; time?: string } | undefined;
  if (options.atCommit !== undefined || options.atTime !== undefined) {
    const rows = await store.rows();
    const head = options.atCommit !== undefined ? resolveCommit(rows, options.atCommit) : await store.head('main');
    if (head == null) throw new OsgError('NOT_INITIALIZED', 'Graph is not initialized');
    const snap = snapshot(rows, head, options.atTime ?? null);
    view = { head, state: snap.state, commits: snap.commits };
    asOf = { ...(options.atCommit !== undefined ? { commitId: head } : {}), ...(options.atTime !== undefined ? { time: new Date(options.atTime / 1000).toISOString() } : {}) };
  } else view = await headView(store, options.cache);
  const { head, state, commits } = view;
  const now = options.now ?? Date.now();

  const nodes: GraphRow[] = [];
  const edges: GraphRow[] = [];
  for (const row of state.values()) (row.src ? edges : nodes).push(row);

  // Seeds: the entity itself, or the best lexical matches.
  const score = new Map<string, number>();
  const reason = new Map<string, { via: string | null; edge: string | null; hops: number; score: number; seed?: 'keyword' | 'meaning' | 'both' }>();
  const queryTokens = [...new Set(tokenize(query))];
  const propsCache = new Map<string, Record<string, unknown>>();
  const props = (row: GraphRow) => { let value = propsCache.get(row.row_key); if (!value) { value = propsOf(row); propsCache.set(row.row_key, value); } return value; };
  const entityNames = (row: GraphRow): string => {
    const list = props(row).entities;
    return Array.isArray(list) ? list.map((id) => String(id).replace(/^.*[#:/]/, '')).join(' ') : '';
  };
  const textOf = (row: GraphRow) => {
    const p = props(row);
    return `${row.element_id} ${p.name ?? ''} ${p.path ?? ''} ${p.task ?? ''} ${p.decision ?? ''} ${p.outcome ?? ''} ${(p.tags as string[] | undefined)?.join(' ') ?? ''} ${entityNames(row)}`;
  };
  if (entity !== undefined) {
    if (state.has(entity) && !state.get(entity)!.src) { score.set(entity, 1); reason.set(entity, { via: null, edge: null, hops: 0, score: 1 }); }
  } else if (queryTokens.length) {
    // Cheap prefilter and document frequency by substring on the lowercased text; exact BM25 only for candidates.
    const lowered = nodes.map((row) => textOf(row).toLowerCase());
    const df = new Map<string, number>(queryTokens.map((token) => [token, 0]));
    const candidates: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      let hit = false;
      for (const token of queryTokens) if (lowered[i]!.includes(token)) { df.set(token, df.get(token)! + 1); hit = true; }
      if (hit) candidates.push(i);
    }
    const docs: Doc[] = candidates.map((i) => {
      const row = nodes[i]!;
      const p = props(row);
      // Field weights by repetition. Code is found by its name; paths and ids only break ties.
      // Episodes are found by task and tags, then decision and the names of the code they concern.
      const tags = (p.tags as string[] | undefined)?.join(' ') ?? '';
      const episode = row.kind === 'episode';
      const heavy = episode ? `${p.task ?? ''} ${tags}` : `${p.name ?? ''} ${tags}`;
      const medium = episode ? `${p.decision ?? ''} ${entityNames(row)}` : '';
      const light = episode ? `${p.outcome ?? ''}` : `${row.element_id} ${p.path ?? ''}`;
      const h = tokenize(heavy), m = tokenize(medium), l = tokenize(light);
      return { row, props: p, tokens: [...h, ...h, ...h, ...m, ...m, ...l] };
    });
    const average = docs.reduce((sum, doc) => sum + doc.tokens.length, 0) / Math.max(1, docs.length);
    const raw = docs.map((doc) => {
      const counts = new Map<string, number>();
      for (const token of doc.tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
      let total = 0;
      for (const token of queryTokens) {
        const tf = counts.get(token) ?? 0;
        if (!tf) continue;
        const n = df.get(token)!;
        const idf = Math.log(1 + (nodes.length - n + 0.5) / (n + 0.5));
        total += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * doc.tokens.length / average));
      }
      return total;
    });
    const top = Math.max(0, ...raw);
    docs.map((doc, i) => [doc, raw[i]!] as const).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1] || (a[0].row.element_id < b[0].row.element_id ? -1 : 1)).slice(0, 24)
      .forEach(([doc, value]) => { const normalized = value / top; score.set(doc.row.element_id, normalized); reason.set(doc.row.element_id, { via: null, edge: null, hops: 0, score: normalized }); });
  }

  // Optional meaning-based seeds. A vector counts only while the element still yields the text it was made from.
  if (entity === undefined && options.vectors && query.trim()) {
    for (const id of score.keys()) reason.get(id)!.seed = 'keyword';
    const queryVector = await options.vectors.embedQuery(query);
    if (queryVector) {
      let kept = 0;
      for (const hit of nearest(options.vectors.index, queryVector, 60)) {
        if (kept >= 24 || hit.similarity < minSimilarity) break;
        const row = state.get(hit.key);
        const text = row && !row.src ? embeddableText(row) : null;
        if (text === null || textDigest(text) !== hit.hash) continue;
        kept++;
        const meaning = (hit.similarity - minSimilarity) / (1 - minSimilarity);
        const lexical = score.get(hit.key) ?? 0;
        const combined = lexical > 0 ? Math.min(1, lexical + 0.3 * meaning) : 0.6 * meaning;
        score.set(hit.key, combined);
        reason.set(hit.key, { via: null, edge: null, hops: 0, score: combined, seed: lexical > 0 ? 'both' : 'meaning' });
      }
    }
  }

  // Weighted expansion over typed edges, two hops, skipping hub nodes.
  const adjacency = new Map<string, { to: string; weight: number; kind: string }[]>();
  for (const row of edges) {
    const weight = weightOf(row);
    for (const [from, to] of [[row.src!, row.dst!], [row.dst!, row.src!]] as const) {
      const list = adjacency.get(from) ?? [];
      list.push({ to, weight, kind: row.kind });
      adjacency.set(from, list);
    }
  }
  let frontier = [...score.keys()];
  for (let hop = 1; hop <= 2; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      const base = score.get(id)!;
      const neighbours = adjacency.get(id) ?? [];
      if (neighbours.length > 60 && hop > 0 && !(entity !== undefined && id === entity)) continue;
      for (const link of neighbours) {
        const value = base * link.weight * 0.55;
        if (value > (score.get(link.to) ?? 0)) {
          if (!score.has(link.to)) next.push(link.to);
          score.set(link.to, value);
          reason.set(link.to, { via: id, edge: link.kind, hops: hop, score: value });
        }
      }
    }
    frontier = next;
  }

  // Episode lifecycle: supersession, newer episodes on the same entity, anchor drift, recency.
  const episodes = nodes.filter((row) => row.kind === 'episode');
  const supersededBy = new Map<string, string>();
  const newestFirst = (a: GraphRow, b: GraphRow) => (b.observed_at ?? 0) - (a.observed_at ?? 0);
  for (const row of [...episodes].sort(newestFirst).reverse()) {
    if (row.status !== 'hypothesis' || row.op !== 'assert' || row.src) continue;
    const list = props(row).supersedes;
    if (Array.isArray(list)) for (const id of list) {
      const target = typeof id === 'string' ? state.get(id) : undefined;
      if (id !== row.element_id && target?.kind === 'episode' && target.status === 'hypothesis' && target.op === 'assert' && !target.src) {
        supersededBy.set(id, row.element_id);
      }
    }
  }
  const byEntity = new Map<string, GraphRow[]>();
  for (const row of episodes) if (!supersededBy.has(row.element_id)) {
    const list = props(row).entities;
    if (Array.isArray(list)) for (const id of list) if (typeof id === 'string') append(byEntity, id, row);
  }
  const newerOn = (row: GraphRow): string[] => {
    const list = props(row).entities;
    if (!Array.isArray(list)) return [];
    const ids = new Set<string>();
    for (const id of list) for (const other of byEntity.get(id as string) ?? []) if ((other.observed_at ?? 0) > (row.observed_at ?? 0)) ids.add(other.element_id);
    return [...ids].sort().slice(0, 3);
  };
  const anchorState = (row: GraphRow): 'ok' | 'changed' | 'missing' | null => {
    const anchors = props(row).anchors;
    if (!Array.isArray(anchors) || !anchors.length) return null;
    let result: 'ok' | 'changed' | 'missing' = 'ok';
    for (const anchor of anchors as { entity: string; sourceHash: string | null; bodyHash: string | null }[]) {
      const current = state.get(anchor.entity);
      if (!current) return 'missing';
      const currentBody = props(current).bodyHash;
      if (anchor.bodyHash && typeof currentBody === 'string' ? anchor.bodyHash !== currentBody : anchor.sourceHash !== current.source_hash) result = 'changed';
    }
    return result;
  };
  const direct = new Set<string>();
  if (entity !== undefined) for (const link of adjacency.get(entity) ?? []) if (link.kind === 'about') direct.add(link.to);
  const finalScore = (row: GraphRow) => {
    let value = score.get(row.element_id) ?? 0;
    if (row.kind === 'episode') {
      const age = Math.max(0, now - (row.observed_at ?? 0) / 1000) / day;
      value *= 1 + 0.25 * Math.pow(0.5, age / 45);
      if (supersededBy.has(row.element_id)) value *= 0.3;
      else if (anchorState(row) !== 'ok' && anchorState(row) !== null) value *= 0.85;
      if (direct.has(row.element_id)) value += 1;
    }
    if (entity === row.element_id) value += 10;
    return value;
  };
  const ranked = nodes.filter((row) => score.has(row.element_id))
    .sort((a, b) => finalScore(b) - finalScore(a) || newestFirst(a, b) || (a.element_id < b.element_id ? -1 : 1));

  // Pack within the budget, counting the exact serialized size. A share of the budget is reserved for
  // episodes, because remembered decisions are what the code graph cannot supply.
  const packed = new Map<string, ContextItem>();
  const budget = maxTokens * 4;
  let used = JSON.stringify({ items: [], graphCommitId: head }).length;
  const reserve = Math.floor(budget * 0.45);
  let episodeBytes = 0;
  const pack = async (row: GraphRow, limit: number): Promise<boolean> => {
    const p = props(row);
    const located = typeof p.path === 'string' && row.extent?.ext_min?.[0] != null && row.extent.ext_max?.[0] != null;
    const git = row.kind === 'episode' && p.git && typeof p.git === 'object'
      ? (() => { const g = p.git as { branch?: string | null; revision?: string | null };
        return { branch: g.branch ?? null, revision: g.revision ?? null, otherBranch: !!options.currentBranch && !!g.branch && g.branch !== options.currentBranch }; })() : null;
    const why = reason.get(row.element_id)!;
    const isEpisode = row.kind === 'episode';
    const build = (isStale: boolean, snippet?: string): ContextItem => {
      const newer = isEpisode && !supersededBy.has(row.element_id) ? newerOn(row) : [];
      const anchors = isEpisode ? anchorState(row) : null;
      // Empty optional fields are left out so more items fit the budget.
      return { elementId: row.element_id, kind: row.kind,
        provenance: { status: row.status, actor: commits.get(row.commit_id!)?.actor ?? null, commitId: row.commit_id!,
          observedAt: row.observed_at == null ? null : new Date(row.observed_at / 1000).toISOString(),
          ...(supersededBy.has(row.element_id) ? { supersededBy: supersededBy.get(row.element_id)! } : {}),
          ...(newer.length ? { newerOnSameEntity: newer } : {}), ...(anchors ? { anchors } : {}), ...(git ? { git } : {}) },
        reason: { ...(why.via ? { via: why.via, edge: why.edge } : {}), hops: why.hops, score: Math.round(finalScore(row) * 100) / 100, ...(why.seed ? { seed: why.seed } : {}) },
        citation: located ? { path: p.path as string, startLine: row.extent!.ext_min![0]!, endLine: row.extent!.ext_max![0]!, sourceHash: row.source_hash, stale: isStale } : null,
        ...(snippet ? { snippet: { untrusted: true as const, value: snippet } } : {}),
        data: { untrusted: true, value: p } };
    };
    const fits = (item: ContextItem) => used + JSON.stringify(item).length + packed.size <= limit;
    // `false` serializes shorter than `true`: if even that does not fit, skip the file read.
    if (!fits(build(false))) return false;
    const isStale = located ? await stale(p.path as string, row.source_hash) : false;
    let snippet: string | undefined;
    if (options.source && located && !isStale && row.kind !== 'file' && row.kind !== 'dir') {
      const start = row.extent!.ext_min![0]!;
      snippet = (await options.source(p.path as string, start, Math.min(row.extent!.ext_max![0]!, start + 11))) ?? undefined;
    }
    let item = build(isStale, snippet);
    if (!fits(item)) { item = build(isStale); if (!fits(item)) return false; }
    const size = JSON.stringify(item).length;
    used += size;
    if (isEpisode) episodeBytes += size;
    packed.set(row.element_id, item);
    return true;
  };
  if (entity !== undefined && ranked[0]?.element_id === entity) await pack(ranked[0], budget);
  for (const row of ranked) if (row.kind === 'episode' && !packed.has(row.element_id) && episodeBytes < reserve) await pack(row, budget);
  for (const row of ranked) if (!packed.has(row.element_id)) await pack(row, budget);
  const items = ranked.filter((row) => packed.has(row.element_id)).map((row) => packed.get(row.element_id)!);
  return { graphCommitId: head, items, estimatedTokens: Math.ceil(JSON.stringify({ items, graphCommitId: head }).length / 4), maxTokens, ...(asOf ? { asOf } : {}) };
}
