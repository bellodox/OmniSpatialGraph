import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { GraphRow } from '../../contracts/src/index.js';

/** Turns text into unit-length vectors. The graph never depends on one: embeddings only add search candidates. */
export interface Embedder {
  readonly id: string;
  readonly dimension: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

/** Derived, rebuildable vectors keyed by element id. `data` holds `keys.length * dimension` floats. */
export interface VectorIndex {
  model: string;
  dimension: number;
  keys: string[];
  /** Digest of the text each vector was made from; a vector is used only while the element still yields the same text. */
  hashes: string[];
  data: Float32Array;
}

export interface VectorStorage {
  read(): Promise<VectorIndex | null>;
  write(index: VectorIndex): Promise<void>;
}

/** What the search needs at query time. The query is embedded lazily so a missing model costs nothing until used. */
export interface QueryVectors {
  index: VectorIndex;
  embedQuery(text: string): Promise<Float32Array | null>;
}

const maxTextLength = 1000;
const skipped = new Set(['file', 'dir']);
const vectorFormat = 2;
// Float32 rounding is allowed, but materially scaled stored vectors are not.
const unitTolerance = 1e-5;

/** Checks metadata before sizes are multiplied or storage is allocated. */
function validMetadata(model: unknown, dimension: unknown, keys: unknown, hashes: unknown): boolean {
  return typeof model === 'string' && model.trim().length > 0
    && typeof dimension === 'number' && Number.isSafeInteger(dimension) && dimension > 0
    && Array.isArray(keys) && keys.every((key) => typeof key === 'string' && key.length > 0)
    && new Set(keys).size === keys.length && Number.isSafeInteger(keys.length * dimension * 4)
    && Array.isArray(hashes) && hashes.length === keys.length
    && hashes.every((hash) => typeof hash === 'string' && /^[0-9a-f]{32}$/.test(hash));
}

/** Finite Float32 values have squared magnitudes representable in a JS number. Zero has no cosine direction. */
function vectorNorm(vector: Float32Array): number {
  let squared = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) return NaN;
    squared += value * value;
  }
  return Math.sqrt(squared);
}

/** Validates even in-memory indexes: callers need not have used the disk decoder. */
function validIndex(index: VectorIndex): boolean {
  if (!validMetadata(index.model, index.dimension, index.keys, index.hashes)
    || !(index.data instanceof Float32Array) || index.data.length !== index.keys.length * index.dimension) return false;
  for (let at = 0; at < index.data.length; at += index.dimension) {
    const norm = vectorNorm(index.data.subarray(at, at + index.dimension));
    if (!Number.isFinite(norm) || Math.abs(norm - 1) > unitTolerance) return false;
  }
  return true;
}

/** Binds ordered metadata and exact binary bytes. This detects inconsistency, not a coherent malicious rewrite. */
function indexDigest(model: string, dimension: number, keys: string[], hashes: string[], data: Uint8Array): string {
  const metadata = JSON.stringify([vectorFormat, model, dimension, keys, hashes]);
  return bytesToHex(sha256.create().update(new TextEncoder().encode(metadata)).update(data).digest());
}

const words = (identifier: string) => identifier.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[_.$#/:-]+/g, ' ').toLowerCase().trim();

/** The text that stands for an element in the vector index, or null for elements that are not embedded (files, directories, edges). */
export function embeddableText(row: GraphRow): string | null {
  if (row.src || skipped.has(row.kind ?? '')) return null;
  let props: Record<string, unknown>;
  try { props = JSON.parse(row.props ?? '{}') as Record<string, unknown>; } catch { return null; }
  const text = (value: unknown) => typeof value === 'string' ? value : '';
  let out: string;
  if (row.kind === 'episode') {
    const tags = Array.isArray(props.tags) ? props.tags.filter((tag) => typeof tag === 'string').join(' ') : '';
    out = [text(props.task), text(props.decision), text(props.outcome), tags].filter(Boolean).join('. ');
  } else {
    const name = text(props.name);
    if (!name) return null;
    out = row.kind === 'heading' ? name : `${row.kind} ${words(name)} in ${text(props.path)}`;
  }
  out = out.trim().slice(0, maxTextLength);
  return out || null;
}

export const textDigest = (text: string): string => bytesToHex(sha256(new TextEncoder().encode(text))).slice(0, 32);

/** Episodes first, then everything else in id order, so a limited run covers the most useful items. */
function candidates(state: Map<string, GraphRow>): { key: string; text: string; hash: string }[] {
  const out: { key: string; text: string; hash: string; episode: boolean }[] = [];
  for (const [key, row] of state) {
    const text = embeddableText(row);
    if (text !== null) out.push({ key, text, hash: textDigest(text), episode: row.kind === 'episode' });
  }
  return out.sort((a, b) => Number(b.episode) - Number(a.episode) || (a.key < b.key ? -1 : 1));
}

export interface EmbedReport { total: number; embedded: number; reused: number; remaining: number; removed: number; skippedZero: number; }

/**
 * Brings the index up to date with the current state. Vectors whose text is unchanged are kept.
 * Stops starting new batches after `deadlineMs` and reports what remains, so a later run continues where this one ended.
 */
export async function buildIndex(state: Map<string, GraphRow>, embedder: Embedder, previous: VectorIndex | null,
  options: { deadlineMs?: number; batch?: number; now?: () => number } = {}): Promise<{ index: VectorIndex; report: EmbedReport }> {
  const now = options.now ?? Date.now;
  const started = now();
  const batch = options.batch ?? 32;
  const dim = embedder.dimension;
  if (!validMetadata(embedder.id, dim, [], []) || !Number.isSafeInteger(batch) || batch < 1) throw new Error('Invalid embedder configuration');
  const wanted = candidates(state);
  const known = new Map<string, Float32Array>();
  const reusable = previous && validIndex(previous) ? previous : null;
  if (reusable && reusable.model === embedder.id && reusable.dimension === dim) {
    reusable.keys.forEach((key, i) => known.set(`${key}\n${reusable.hashes[i]}`, reusable.data.subarray(i * dim, (i + 1) * dim)));
  }
  const keys: string[] = [];
  const hashes: string[] = [];
  const vectors: Float32Array[] = [];
  const todo: typeof wanted = [];
  let reused = 0;
  for (const item of wanted) {
    const vector = known.get(`${item.key}\n${item.hash}`);
    if (vector) { keys.push(item.key); hashes.push(item.hash); vectors.push(vector); reused++; } else todo.push(item);
  }
  let embedded = 0;
  let skippedZero = 0;
  for (let at = 0; at < todo.length; at += batch) {
    if (options.deadlineMs !== undefined && now() - started >= options.deadlineMs) break;
    const slice = todo.slice(at, at + batch);
    const out = await embedder.embed(slice.map((item) => item.text));
    if (out.length !== slice.length || out.some((vector) => !(vector instanceof Float32Array) || vector.length !== dim)) throw new Error('Embedder returned an unexpected shape');
    slice.forEach((item, i) => {
      const vector = out[i]!;
      const norm = vectorNorm(vector);
      if (!Number.isFinite(norm)) throw new Error('Embedder returned nonfinite values');
      // A legitimate all-zero model output cannot be normalized: omit it, report it, and leave lexical retrieval intact.
      if (norm === 0) { skippedZero++; return; }
      keys.push(item.key); hashes.push(item.hash); vectors.push(vector.map((value) => value / norm)); embedded++;
    });
  }
  const data = new Float32Array(keys.length * dim);
  vectors.forEach((vector, i) => data.set(vector, i * dim));
  const removed = reusable ? reusable.keys.filter((key) => !state.has(key)).length : 0;
  return { index: { model: embedder.id, dimension: dim, keys, hashes, data },
    report: { total: wanted.length, embedded, reused, remaining: todo.length - embedded - skippedZero, removed, skippedZero } };
}

/** Actual bounded cosine, including Float32 unit-rounding error; invalid indexes/queries never add rank. */
export function nearest(index: VectorIndex, query: Float32Array, limit: number): { key: string; hash: string; similarity: number }[] {
  const dim = index.dimension;
  if (!Number.isSafeInteger(limit) || limit < 1 || !validIndex(index) || !(query instanceof Float32Array) || query.length !== dim) return [];
  const queryNorm = vectorNorm(query);
  if (!Number.isFinite(queryNorm) || queryNorm === 0) return [];
  const best: { at: number; similarity: number }[] = [];
  for (let at = 0; at < index.keys.length; at++) {
    let dot = 0;
    const base = at * dim;
    for (let d = 0; d < dim; d++) dot += index.data[base + d]! * query[d]!;
    const norm = vectorNorm(index.data.subarray(base, base + dim));
    const similarity = Math.max(-1, Math.min(1, dot / (norm * queryNorm)));
    if (best.length < limit || similarity > best[best.length - 1]!.similarity) {
      best.push({ at, similarity });
      best.sort((a, b) => b.similarity - a.similarity);
      if (best.length > limit) best.pop();
    }
  }
  return best.map(({ at, similarity }) => ({ key: index.keys[at]!, hash: index.hashes[at]!, similarity }));
}

/** Versioned rebuildable format: bound JSON metadata plus an owned snapshot of little-endian float bytes. */
export function encodeIndex(index: VectorIndex): { header: string; data: Uint8Array } {
  if (!validIndex(index)) throw new Error('Invalid vector index');
  const { model, dimension, keys, hashes } = index;
  const data = new Uint8Array(index.data.byteLength);
  const view = new DataView(data.buffer);
  index.data.forEach((value, at) => view.setFloat32(at * 4, value, true));
  return { header: JSON.stringify({ schemaVersion: vectorFormat, model, dimension, keys, hashes,
    digest: indexDigest(model, dimension, keys, hashes, data) }), data };
}

/** Old, torn, mixed or invalid caches are misses. Only an explicit embed command rebuilds them; graph format is unrelated. */
export function decodeIndex(header: unknown, data: Uint8Array): VectorIndex | null {
  if (!header || typeof header !== 'object') return null;
  const value = header as Record<string, unknown>;
  if (value.schemaVersion !== vectorFormat || !validMetadata(value.model, value.dimension, value.keys, value.hashes)
    || typeof value.digest !== 'string' || !/^[0-9a-f]{64}$/.test(value.digest)) return null;
  const model = value.model as string, dimension = value.dimension as number;
  const keys = value.keys as string[], hashes = value.hashes as string[];
  if (data.byteLength !== keys.length * dimension * 4 || indexDigest(model, dimension, keys, hashes, data) !== value.digest) return null;
  const floats = new Float32Array(data.byteLength / 4);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let at = 0; at < floats.length; at++) floats[at] = view.getFloat32(at * 4, true);
  const index = { model, dimension, keys: [...keys], hashes: [...hashes], data: floats };
  return validIndex(index) ? index : null;
}
