// Copyright 2026 Vlad Bellomorski
// SPDX-License-Identifier: Apache-2.0
// Experimental temporal-world API. Does not change the frozen MVP specification.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { OsgError, type GraphPort, type GraphRow } from '../../contracts/src/index.js';
import { canon, hash } from './hash.js';
import { commit, reach, snapshot, verify, type HeadView, type Proposal } from './graph.js';
import { applyDelta } from './state.js';
import { committedView, rememberCommittedView } from './committed-views.js';

/** Host-owned immutable assets. put must durably publish bytes before resolving. */
export interface WorldAssets { put(bytes: Uint8Array): Promise<string>; get(hash: string): Promise<Uint8Array>; }
export interface WorldRecord {
  sequence: number; step: number; timeMicros: number; entityId: string; frameId: string;
  operation: 'state' | 'delete'; marked: boolean; payload: Uint8Array;
}
export interface WorldSegment {
  schema: 1; runId: string; epoch: number; assetHash: string; previousAssetHash: string | null;
  firstSequence: number; lastSequence: number; firstTimeMicros: number; lastTimeMicros: number;
  lastStep: number; count: number; entityIds: string[]; markedSequences: number[];
}
export interface WorldRevision { head: string; generation: number; }
interface Entry { segment: WorldSegment; commitId: string; }
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_BYTES = 4 * 1024 * 1024, MAX_RECORDS = 1024;
const digest = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
function requireValue(ok: unknown, message: string): asserts ok { if (!ok) throw new OsgError('INVALID_WORLD', message); }
function integer(n: number): boolean { return Number.isSafeInteger(n) && n >= 0; }
function text(s: string): boolean { return typeof s === 'string' && s.length > 0 && s.length <= 256; }
const streamId = (runId: string, epoch: number) => `sim:stream:${hash({ runId, epoch })}`;
const proposal = (id: string, kind: string, props: Record<string, unknown> | null, source: string | null = null): Proposal => ({
  element_id: id, kind, op: 'assert', status: 'observed', src: null, dst: null, predicate: null,
  extent: null, props, source_hash: source, valid_from: null, valid_to: null, observed_at: null
});

/** Bounded, versioned binary segment. Floating-point payloads remain opaque bytes. */
export function encodeWorldRecords(records: WorldRecord[]): Uint8Array {
  requireValue(Array.isArray(records) && records.length > 0 && records.length <= MAX_RECORDS, 'Invalid record count');
  let previous: WorldRecord | undefined;
  const metadata = records.map((r) => {
    requireValue(integer(r.sequence) && r.sequence > 0 && integer(r.step) && integer(r.timeMicros) && text(r.entityId) && text(r.frameId), 'Invalid record metadata');
    requireValue(r.operation === 'state' || r.operation === 'delete', 'Invalid operation');
    requireValue(typeof r.marked === 'boolean', 'Invalid record marker');
    requireValue(r.payload instanceof Uint8Array && r.payload.length <= MAX_BYTES, 'Invalid payload');
    if (previous) requireValue(r.sequence === previous.sequence + 1 && r.step >= previous.step && r.timeMicros >= previous.timeMicros, 'Discontinuous record stream');
    previous = r;
    return { sequence: r.sequence, step: r.step, timeMicros: r.timeMicros, entityId: r.entityId, frameId: r.frameId, operation: r.operation, marked: r.marked, size: r.payload.length };
  });
  const header = encoder.encode(canon({ schema: 'osg-world-segment-1', records: metadata }));
  const size = 4 + header.length + records.reduce((n, r) => n + r.payload.length, 0);
  requireValue(size <= MAX_BYTES, 'World segment exceeds 4 MiB');
  const bytes = new Uint8Array(size); new DataView(bytes.buffer).setUint32(0, header.length, true); bytes.set(header, 4);
  let offset = 4 + header.length;
  for (const r of records) { bytes.set(r.payload, offset); offset += r.payload.length; }
  return bytes;
}
export function decodeWorldRecords(bytes: Uint8Array): WorldRecord[] {
  requireValue(bytes instanceof Uint8Array && bytes.length >= 4 && bytes.length <= MAX_BYTES, 'Invalid world asset');
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  requireValue(size > 0 && size <= bytes.length - 4, 'Invalid world header size');
  const header = JSON.parse(decoder.decode(bytes.subarray(4, 4 + size)));
  requireValue(header.schema === 'osg-world-segment-1' && Array.isArray(header.records), 'Unknown world asset format');
  let offset = 4 + size;
  const records = header.records.map((m: any) => {
    requireValue(integer(m.size) && offset + m.size <= bytes.length, 'Invalid payload range');
    const payload = bytes.slice(offset, offset + m.size); offset += m.size;
    return { sequence: m.sequence, step: m.step, timeMicros: m.timeMicros, entityId: m.entityId, frameId: m.frameId, operation: m.operation, marked: m.marked, payload } as WorldRecord;
  });
  requireValue(offset === bytes.length, 'Trailing world asset data');
  // Reuse all ordering and shape checks, and reject noncanonical header metadata.
  requireValue(digest(encodeWorldRecords(records)) === digest(bytes), 'Noncanonical world asset');
  return records;
}

/** One instance serves concurrent clients; all mutations serialize, reads pin immutable revisions.
 * Other process writers retain the existing graph head CAS. Call refresh to observe them.
 * It is an application broker, not distributed consensus or an authentication boundary.
 */
export class WorldGraph {
  private view!: HeadView;
  private entries: Entry[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private listeners = new Set<(revision: WorldRevision) => void>();
  private constructor(private store: GraphPort, private assets: WorldAssets) {}
  static async open(store: GraphPort, assets: WorldAssets): Promise<WorldGraph> {
    const world = new WorldGraph(store, assets); await world.reload(); return world;
  }
  private async reload(): Promise<void> {
    const current = await this.store.head('main'), shared = current ? committedView(this.store, current) : undefined;
    if (shared && this.view) {
      const accepted = reach(shared.commits, shared.head);
      if (this.view.head === 'ROOT' || accepted.has(this.view.head)) {
        const previous = reach(this.view.commits, this.view.head);
        const delta = await this.store.rowsOfCommits([...accepted].filter(id => !previous.has(id)));
        this.entries = [...this.entries.filter(e => accepted.has(e.commitId)), ...delta.filter(r => r.kind === 'world_segment')
          .map(r => ({ segment: JSON.parse(r.props!) as WorldSegment, commitId: r.commit_id! }))];
        this.view = shared; return;
      }
    }
    const rows = await this.store.rows();
    // Use the head returned in the same storage snapshot, never a separate moving head read.
    const head = rows.find((r) => r.row_type === 'head' && r.branch === 'main')?.head;
    requireValue(head, 'Missing main head'); verify(rows, head);
    const state = snapshot(rows, head);
    const entries = rows.filter((r) => r.kind === 'world_segment' && state.reachable.has(r.commit_id!))
      .map((r) => ({ segment: JSON.parse(r.props!) as WorldSegment, commitId: r.commit_id! }));
    this.view = { head, state: state.state, commits: state.commits }; this.entries = entries;
    rememberCommittedView(this.store, this.view);
  }
  private serial<T>(fn: () => Promise<T>, retryStale = false): Promise<T> {
    if (this.pending >= 64) return Promise.reject(new OsgError('WORLD_BUSY', 'World mutation queue is full'));
    this.pending++;
    const operation = this.queue.then(async () => {
      for (let attempt = 0; ; attempt++) {
        try { return await fn(); }
        catch (error) {
          const duplicate = error instanceof OsgError && error.code === 'INVALID_DELTA' && error.message === 'Duplicate or mutable row key';
          if (!retryStale || !(error instanceof OsgError) || (error.code !== 'STALE_HEAD' && !duplicate) || attempt >= 7) throw error;
          await this.reload();
        }
      }
    });
    this.queue = operation.catch(() => {}).finally(() => { this.pending--; }); return operation;
  }
  private visible(head: string): Set<string> {
    const accepted = reach(this.view.commits, this.view.head);
    requireValue(head === 'ROOT' || accepted.has(head), 'Head is not accepted main history');
    return reach(this.view.commits, head);
  }
  get revision(): WorldRevision { return { head: this.view.head, generation: this.view.commits.get(this.view.head)?.generation ?? 0 }; }
  subscribe(listener: (revision: WorldRevision) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  async refresh(): Promise<WorldRevision> {
    return this.serial(async () => {
      if (await this.store.head('main') !== this.view.head) {
        await this.reload();
        for (const listener of this.listeners) { try { listener(this.revision); } catch { /* observer isolation */ } }
      }
      return this.revision;
    });
  }
  private async publish(proposals: Proposal[], actor: string, expected: string): Promise<string> {
    if (expected !== this.view.head) throw new OsgError('STALE_HEAD', 'Client revision is stale', { expected, actual: this.view.head });
    const result = await commit(this.store, proposals, actor, 'main', expected, this.view);
    if (!result.noop) {
      const written = await this.store.rowsOfCommits([result.commitId]);
      const commitRow = this.store.commitRow ? await this.store.commitRow(result.commitId) : (await this.store.commitRows()).find((r) => r.commit_id === result.commitId);
      requireValue(commitRow, 'Published commit metadata is missing');
      const state = new Map(this.view.state); applyDelta(state, written);
      const commits = new Map(this.view.commits); commits.set(result.commitId, commitRow);
      this.view = { head: result.commitId, state, commits };
      rememberCommittedView(this.store, this.view);
      this.entries = [...this.entries, ...written.filter((r) => r.kind === 'world_segment')
        .map((r) => ({ segment: JSON.parse(r.props!) as WorldSegment, commitId: result.commitId }))];
      for (const listener of this.listeners) { try { listener(this.revision); } catch { /* observers cannot undo a commit */ } }
    }
    return result.commitId;
  }
  append(runId: string, epoch: number, records: WorldRecord[], expectedHead?: string): Promise<WorldRevision & { assetHash: string; idempotent: boolean }> {
    // Own caller bytes before asynchronous writes; one client cannot mutate another's in-flight batch.
    const bytes = encodeWorldRecords(records), owned = decodeWorldRecords(bytes);
    requireValue(text(runId) && integer(epoch), 'Invalid stream identity');
    return this.serial(async () => {
      if (await this.store.head('main') !== this.view.head) await this.reload();
      const id = streamId(runId, epoch), priorRow = this.view.state.get(id);
      const prior = priorRow ? JSON.parse(priorRow.props!) as WorldSegment : null;
      const assetHash = digest(bytes), first = owned[0]!, last = owned.at(-1)!;
      if (this.entries.some((e) => e.segment.runId === runId && e.segment.epoch === epoch && e.segment.assetHash === assetHash)) return { ...this.revision, assetHash, idempotent: true };
      if (expectedHead != null && expectedHead !== this.view.head) throw new OsgError('STALE_HEAD', 'Client revision is stale');
      requireValue(first.sequence === (prior?.lastSequence ?? 0) + 1, 'Missing, repeated or reordered world samples');
      if (prior) requireValue(first.timeMicros >= prior.lastTimeMicros, 'Regressed simulation time requires a new epoch');
      if (prior) requireValue(first.step >= prior.lastStep, 'Regressed integration step requires a new epoch');
      requireValue(await this.assets.put(bytes) === assetHash, 'Asset store returned incorrect hash');
      const segment: WorldSegment = { schema: 1, runId, epoch, assetHash, previousAssetHash: prior?.assetHash ?? null,
        firstSequence: first.sequence, lastSequence: last.sequence, firstTimeMicros: first.timeMicros, lastTimeMicros: last.timeMicros,
        lastStep: last.step, count: owned.length, entityIds: [...new Set(owned.map((r) => r.entityId))].sort(), markedSequences: owned.filter((r) => r.marked).map((r) => r.sequence) };
      const proposals = [proposal(id, 'world_segment', { ...segment }, assetHash)];
      const latest = new Map(owned.map((r) => [r.entityId, r]));
      const frames = new Set<string>();
      for (const r of latest.values()) {
        const entity = `sim:entity:${hash({ runId, epoch, entityId: r.entityId })}`;
        const frame = `sim:frame:${hash({ frameId: r.frameId })}`;
        if (!frames.has(frame)) { proposals.push(proposal(frame, 'world_frame', { frameId: r.frameId })); frames.add(frame); }
        proposals.push(proposal(entity, 'world_entity', { runId, epoch, entityId: r.entityId, frameId: r.frameId,
          sequence: r.sequence, step: r.step, timeMicros: r.timeMicros, assetHash, deleted: r.operation === 'delete' }, assetHash));
        const relation = (suffix: string, target: string, predicate: string) => ({ ...proposal(`sim:relation:${hash({ entity, suffix })}`, 'world_relation', null), src: entity, dst: target, predicate });
        proposals.push(relation('frame', frame, 'in_frame'), relation('stream', id, 'observed_in'));
      }
      await this.publish(proposals, 'simulation-world', this.view.head);
      return { ...this.revision, assetHash, idempotent: false };
    }, expectedHead === undefined);
  }
  /** Graph-native entity/frame links complement the dense exact-state byte assets. */
  entities(): { head: string; entities: Record<string, unknown>[] } {
    return { head: this.view.head, entities: [...this.view.state.values()].filter((r) => r.kind === 'world_entity')
      .map((r) => ({ elementId: r.element_id, version: r.row_key, ...JSON.parse(r.props!) })) };
  }
  /** Sparse event index: reads only assets with marked records, never the dense trajectory. */
  async marked({ runId, epoch, timeMicros = Number.MAX_SAFE_INTEGER, head = this.view.head }: { runId: string; epoch: number; timeMicros?: number; head?: string }): Promise<{ head: string; records: WorldRecord[] }> {
    requireValue(text(runId) && integer(epoch) && integer(timeMicros), 'Invalid marked query');
    const visible = this.visible(head);
    const entries = this.entries.filter(({ segment: s, commitId }) => visible.has(commitId) && s.runId === runId && s.epoch === epoch && s.firstTimeMicros <= timeMicros && s.markedSequences.length > 0)
      .sort((a, b) => a.segment.firstSequence - b.segment.firstSequence);
    const records: WorldRecord[] = []; let bytesRead = 0;
    for (const { segment: s } of entries) {
      const bytes = await this.assets.get(s.assetHash); bytesRead += bytes.length;
      requireValue(bytesRead <= 32 * 1024 * 1024, 'Marked query exceeds byte budget');
      requireValue(digest(bytes) === s.assetHash, 'World asset hash mismatch');
      const marked = decodeWorldRecords(bytes).filter((r) => r.marked);
      requireValue(canon(marked.map((r) => r.sequence)) === canon(s.markedSequences), 'World marker index mismatch');
      records.push(...marked.filter((r) => r.timeMicros <= timeMicros));
      requireValue(records.length <= 10000, 'Marked query exceeds record budget');
    }
    return { head, records };
  }
  /** Bounded, head-pinned marked history. A cursor is the next sample sequence in the chosen direction. */
  async markedPage({ runId, epoch, timeMicros = Number.MAX_SAFE_INTEGER, head = this.view.head,
    direction = 'backward', fromSequence, limit = 128 }: { runId: string; epoch: number; timeMicros?: number; head?: string;
      direction?: 'forward' | 'backward'; fromSequence?: number; limit?: number }) {
    requireValue(text(runId) && integer(epoch) && integer(timeMicros) && ['forward', 'backward'].includes(direction) && integer(limit) && limit > 0 && limit <= 1000, 'Invalid marked page');
    const cursor = fromSequence ?? (direction === 'forward' ? 1 : Number.MAX_SAFE_INTEGER);
    requireValue(integer(cursor) && cursor > 0, 'Invalid marked cursor');
    const visible = this.visible(head), forward = direction === 'forward';
    const entries = this.entries.filter(({ segment: s, commitId }) => visible.has(commitId) && s.runId === runId && s.epoch === epoch && s.firstTimeMicros <= timeMicros && s.markedSequences.length && (forward ? s.lastSequence >= cursor : s.firstSequence <= cursor))
      .sort((a, b) => forward ? a.segment.firstSequence - b.segment.firstSequence : b.segment.firstSequence - a.segment.firstSequence);
    const records: WorldRecord[] = []; let bytesRead = 0;
    for (const { segment: segment } of entries) {
      const bytes = await this.assets.get(segment.assetHash);
      if (bytesRead + bytes.length > 32 * 1024 * 1024) return { head, records, nextSequence: forward ? Math.max(cursor, segment.firstSequence) : Math.min(cursor, segment.lastSequence) };
      bytesRead += bytes.length; requireValue(digest(bytes) === segment.assetHash, 'World asset hash mismatch');
      const all = decodeWorldRecords(bytes), marked = all.filter(r => r.marked);
      requireValue(canon(marked.map(r => r.sequence)) === canon(segment.markedSequences), 'World marker index mismatch');
      const ordered = forward ? marked : marked.slice().reverse();
      for (const record of ordered) if (record.timeMicros <= timeMicros && (forward ? record.sequence >= cursor : record.sequence <= cursor)) {
        if (records.length === limit) return { head, records, nextSequence: record.sequence };
        records.push(record);
      }
    }
    return { head, records, nextSequence: null };
  }
  /** Separate namespaces for agent/browser annotations. Never accepts arbitrary physical proposals. */
  annotate(clientId: string, id: string, value: { text: string }, expectedHead: string): Promise<WorldRevision> {
    requireValue(text(clientId) && text(id) && typeof value?.text === 'string' && value.text.length <= 8192, 'Invalid annotation');
    const props = { clientId, id, text: value.text }; // discard every other caller field
    return this.serial(async () => {
      if (await this.store.head('main') !== this.view.head) await this.reload();
      const p = proposal(`agent:annotation:${hash({ clientId, id })}`, 'world_annotation', props); p.status = 'hypothesis';
      await this.publish([p], `client:${clientId}`, expectedHead); return this.revision;
    });
  }
  annotations(head = this.view.head): { head: string; items: Record<string, unknown>[] } {
    const visible = this.visible(head);
    // State at an older revision is reconstructed by the storage caller; this API returns current annotations only.
    requireValue(head === this.view.head, 'Annotations require current revision');
    return { head, items: [...this.view.state.values()].filter((r) => r.kind === 'world_annotation' && visible.has(r.commit_id!)).map((r) => ({ ...JSON.parse(r.props!), status: 'hypothesis', untrusted: true })) };
  }
  streams(head = this.view.head): { head: string; streams: { runId: string; epoch: number; firstTimeMicros: number; lastTimeMicros: number; samples: number; generation: number }[] } {
    const visible = this.visible(head), grouped = new Map<string, any>();
    for (const { segment: s, commitId } of this.entries) if (visible.has(commitId)) {
      const key = streamId(s.runId, s.epoch), entry = grouped.get(key);
      const generation = this.view.commits.get(commitId)!.generation!;
      if (!entry) grouped.set(key, { runId: s.runId, epoch: s.epoch, firstTimeMicros: s.firstTimeMicros, lastTimeMicros: s.lastTimeMicros, samples: s.count, generation });
      else { entry.firstTimeMicros = Math.min(entry.firstTimeMicros, s.firstTimeMicros); entry.lastTimeMicros = Math.max(entry.lastTimeMicros, s.lastTimeMicros); entry.samples += s.count; entry.generation = Math.max(entry.generation, generation); }
    }
    return { head, streams: [...grouped.values()] };
  }
  /** Paged exact history. Clients carry both head and nextSequence across pages. */
  async first({ runId, epoch, entityId, head = this.view.head }: { runId: string; epoch: number; entityId: string; head?: string }): Promise<WorldRecord | null> {
    requireValue(text(runId) && integer(epoch) && text(entityId), 'Invalid first-state query');
    const visible = this.visible(head);
    const entry = this.entries.filter(({ segment: s, commitId }) => visible.has(commitId) && s.runId === runId && s.epoch === epoch && s.entityIds.includes(entityId))
      .sort((a, b) => a.segment.firstSequence - b.segment.firstSequence)[0];
    if (!entry) return null;
    const bytes = await this.assets.get(entry.segment.assetHash);
    requireValue(digest(bytes) === entry.segment.assetHash, 'World asset hash mismatch');
    return decodeWorldRecords(bytes).find((r) => r.entityId === entityId) ?? null;
  }
  /** Paged exact history. Clients carry both head and nextSequence across pages. */
  async range({ runId, epoch, fromSequence = 1, limit = 1024, head = this.view.head }: { runId: string; epoch: number; fromSequence?: number; limit?: number; head?: string }): Promise<{ head: string; records: WorldRecord[]; nextSequence: number | null }> {
    requireValue(text(runId) && integer(epoch) && integer(fromSequence) && fromSequence > 0 && integer(limit) && limit > 0 && limit <= 4096, 'Invalid world range');
    const visible = this.visible(head);
    const entries = this.entries.filter(({ segment: s, commitId }) => visible.has(commitId) && s.runId === runId && s.epoch === epoch && s.lastSequence >= fromSequence)
      .sort((a, b) => a.segment.firstSequence - b.segment.firstSequence);
    const records: WorldRecord[] = []; let bytesRead = 0;
    for (const { segment: s } of entries) {
      const bytes = await this.assets.get(s.assetHash); bytesRead += bytes.length;
      requireValue(bytesRead <= 32 * 1024 * 1024, 'World range exceeds byte budget; request fewer records');
      requireValue(digest(bytes) === s.assetHash, 'World asset hash mismatch');
      const decoded = decodeWorldRecords(bytes);
      requireValue(decoded.length === s.count && decoded[0]!.sequence === s.firstSequence && decoded.at(-1)!.sequence === s.lastSequence, 'World asset metadata mismatch');
      for (const r of decoded) if (r.sequence >= fromSequence) {
        if (records.length === limit) return { head, records, nextSequence: r.sequence };
        records.push(r);
      }
    }
    return { head, records, nextSequence: null };
  }
  /** Pure read. The selected commit and entry list stay fixed across all asset awaits. */
  async read({ runId, epoch, timeMicros = Number.MAX_SAFE_INTEGER, head = this.view.head }: { runId: string; epoch: number; timeMicros?: number; head?: string }): Promise<{ head: string; records: WorldRecord[]; segmentsRead: number }> {
    requireValue(text(runId) && integer(epoch) && integer(timeMicros), 'Invalid world query');
    const visible = this.visible(head);
    const entries = this.entries.filter(({ segment: s, commitId }) => visible.has(commitId) && s.runId === runId && s.epoch === epoch)
      .sort((a, b) => b.segment.firstSequence - a.segment.firstSequence);
    const byEntity = new Map<string, Entry[]>();
    for (const entry of entries) if (entry.segment.firstTimeMicros <= timeMicros) for (const id of entry.segment.entityIds) {
      const list = byEntity.get(id) ?? []; list.push(entry); byEntity.set(id, list);
    }
    const found = new Map<string, WorldRecord>(), decoded = new Map<string, WorldRecord[]>();
    let segmentsRead = 0, bytesRead = 0;
    for (const [id, candidates] of byEntity) for (const { segment: segment } of candidates) {
      let records = decoded.get(segment.assetHash);
      if (!records) {
        const bytes = await this.assets.get(segment.assetHash); bytesRead += bytes.length;
        requireValue(bytesRead <= 32 * 1024 * 1024, 'World snapshot exceeds byte budget; reduce entity scope');
        requireValue(digest(bytes) === segment.assetHash, 'World asset hash mismatch');
        records = decodeWorldRecords(bytes); segmentsRead++;
        requireValue(records.length === segment.count && records[0]!.sequence === segment.firstSequence && records.at(-1)!.sequence === segment.lastSequence && records[0]!.timeMicros === segment.firstTimeMicros && records.at(-1)!.timeMicros === segment.lastTimeMicros, 'World asset metadata mismatch');
        decoded.set(segment.assetHash, records);
      }
      const record = records.slice().reverse().find(r => r.entityId === id && r.timeMicros <= timeMicros);
      if (record) { found.set(id, record); break; }
    }
    return { head, records: [...found.values()].filter((r) => r.operation !== 'delete').sort((a, b) => a.entityId.localeCompare(b.entityId)), segmentsRead };
  }
}
