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

export interface EmbedReport { total: number; embedded: number; reused: number; remaining: number; removed: number; }

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
  const wanted = candidates(state);
  const known = new Map<string, Float32Array>();
  if (previous && previous.model === embedder.id && previous.dimension === dim && previous.data.length === previous.keys.length * dim) {
    previous.keys.forEach((key, i) => known.set(`${key}\n${previous.hashes[i]}`, previous.data.subarray(i * dim, (i + 1) * dim)));
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
  for (let at = 0; at < todo.length; at += batch) {
    if (options.deadlineMs !== undefined && now() - started >= options.deadlineMs) break;
    const slice = todo.slice(at, at + batch);
    const out = await embedder.embed(slice.map((item) => item.text));
    if (out.length !== slice.length || out.some((vector) => vector.length !== dim)) throw new Error('Embedder returned an unexpected shape');
    slice.forEach((item, i) => { keys.push(item.key); hashes.push(item.hash); vectors.push(out[i]!); });
    embedded += slice.length;
  }
  const data = new Float32Array(keys.length * dim);
  vectors.forEach((vector, i) => data.set(vector, i * dim));
  const removed = previous ? previous.keys.filter((key) => !state.has(key)).length : 0;
  return { index: { model: embedder.id, dimension: dim, keys, hashes, data },
    report: { total: wanted.length, embedded, reused, remaining: todo.length - embedded, removed } };
}

/** Cosine similarity of `query` against every stored vector (vectors are unit length), best first. */
export function nearest(index: VectorIndex, query: Float32Array, limit: number): { key: string; hash: string; similarity: number }[] {
  const dim = index.dimension;
  if (query.length !== dim || index.data.length !== index.keys.length * dim) return [];
  const best: { at: number; similarity: number }[] = [];
  for (let at = 0; at < index.keys.length; at++) {
    let dot = 0;
    const base = at * dim;
    for (let d = 0; d < dim; d++) dot += index.data[base + d]! * query[d]!;
    if (best.length < limit || dot > best[best.length - 1]!.similarity) {
      best.push({ at, similarity: dot });
      best.sort((a, b) => b.similarity - a.similarity);
      if (best.length > limit) best.pop();
    }
  }
  return best.map(({ at, similarity }) => ({ key: index.keys[at]!, hash: index.hashes[at]!, similarity }));
}

/** Serialised form: a small JSON header and the raw little-endian floats. */
export function encodeIndex(index: VectorIndex): { header: string; data: Uint8Array } {
  return { header: JSON.stringify({ schemaVersion: 1, model: index.model, dimension: index.dimension, keys: index.keys, hashes: index.hashes }),
    data: new Uint8Array(index.data.buffer, index.data.byteOffset, index.data.byteLength) };
}

export function decodeIndex(header: unknown, data: Uint8Array): VectorIndex | null {
  if (!header || typeof header !== 'object') return null;
  const value = header as Record<string, unknown>;
  const { model, dimension, keys, hashes } = value;
  if (value.schemaVersion !== 1 || typeof model !== 'string' || !Number.isInteger(dimension) || (dimension as number) < 1
    || !Array.isArray(keys) || !Array.isArray(hashes) || keys.length !== hashes.length
    || !keys.every((key) => typeof key === 'string') || !hashes.every((hash) => typeof hash === 'string')) return null;
  const dim = dimension as number;
  if (data.byteLength !== keys.length * dim * 4) return null;
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const floats = new Float32Array(copy.buffer);
  for (const number of floats) if (!Number.isFinite(number)) return null;
  return { model, dimension: dim, keys: keys as string[], hashes: hashes as string[], data: floats };
}
