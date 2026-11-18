// Copyright 2026 Vlad Bellomorski
// SPDX-License-Identifier: Apache-2.0
import { OsgError, type GraphPort, type GraphRow } from '../../contracts/src/index.js';
import { hash } from './hash.js';
import { commit, snapshot, reach, verify, type Proposal, type HeadView } from './graph.js';
import { applyDelta } from './state.js';
import { committedView, rememberCommittedView } from './committed-views.js';

export const participationProtocol = 'osg-participation-1';
export interface ActivityRequest {
  sessionId: string; requestId: string; contextId: string; activityId: string;
  action: 'start' | 'note' | 'finish'; text: string;
  expectedVersion: string | null;
  requires?: { elementId: string; version: string | null }[];
}
export interface ActivityResult {
  head: string; appliedHead: string; activityId: string; version: string; idempotent: boolean;
}
const valid = (ok: unknown, message: string): void => { if (!ok) throw new OsgError('INVALID_ACTIVITY', message); };
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
const activityKey = (actor: string, contextId: string, activityId: string) => `shared:activity:${hash({ actor, contextId, activityId })}`;
const props = (row: GraphRow) => JSON.parse(row.props!);
const fact = (element_id: string, kind: string, value: Record<string, unknown>): Proposal => ({
  element_id, kind, op: 'assert', status: 'hypothesis', props: value, src: null, dst: null,
  predicate: null, extent: null, source_hash: null, valid_from: null, valid_to: null, observed_at: null
});

/** Generic peer activities, not approval, physics control, authentication or distributed consensus.
 * Hosts supply a trusted actor identity. Every mutation validates against the same revision as its CAS.
 */
export class ParticipationGraph {
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private cached?: HeadView;
  constructor(private store: GraphPort) {}
  private async view(head?: string): Promise<HeadView> {
    // In-memory state is derived only from acknowledged immutable graph rows.
    // External publication invalidates it; no editable disk cache is trusted.
    if (head === undefined) {
      const current = await this.store.head('main');
      if (current === this.cached?.head) return this.cached!;
      const shared = current ? committedView(this.store, current) : undefined;
      if (shared) { this.cached = shared; return shared; }
    }
    const rows = await this.store.rows();
    const at = head ?? rows.find(r => r.row_type === 'head' && r.branch === 'main')?.head;
    if (!at) throw new OsgError('NOT_INITIALIZED', 'Missing main head');
    if (head !== undefined) {
      const accepted = rows.find(r => r.row_type === 'head' && r.branch === 'main')?.head;
      const commits = new Map(rows.filter(r => r.row_type === 'commit').map(r => [r.commit_id!, r]));
      valid(!!accepted && (head === 'ROOT' || reach(commits, accepted!).has(head)), 'Head is not accepted main history');
    }
    verify(rows, at);
    const resolved = snapshot(rows, at);
    const view = { head: at, state: resolved.state, commits: resolved.commits };
    if (head === undefined) { this.cached = view; rememberCommittedView(this.store, view); }
    return view;
  }
  async list({ contextId, head, limit = 256, after, state, actor, activityId }: { contextId?: string; head?: string; limit?: number; after?: string; state?: string; actor?: string; activityId?: string } = {}) {
    valid(Number.isSafeInteger(limit) && limit > 0 && limit <= 1000, 'Invalid activity limit');
    valid(after === undefined || (typeof after === 'string' && /^shared:activity:[0-9a-f]{64}$/.test(after) && head !== undefined), 'Activity cursor requires a pinned head');
    valid(state === undefined || ['active', 'finished'].includes(state), 'Invalid activity state');
    const view = await this.view(head);
    const items = [...view.state.values()].filter(r => r.kind === 'shared_activity')
      .map(r => ({ ...props(r), elementId: r.element_id, version: r.row_key, status: 'hypothesis', untrusted: true }))
      .filter(r => contextId === undefined || r.contextId === contextId)
      .filter(r => (state === undefined || r.state === state) && (actor === undefined || r.actor === actor) && (activityId === undefined || r.activityId === activityId) && (after === undefined || r.elementId > after))
      .sort((a, b) => a.elementId < b.elementId ? -1 : a.elementId > b.elementId ? 1 : 0);
    return { head: view.head, items: items.slice(0, limit), truncated: items.length > limit,
      nextAfter: items.length > limit ? items[limit - 1]!.elementId : null };
  }
  submit(actor: string, input: ActivityRequest): Promise<ActivityResult> {
    valid(identifier(actor) && input !== null && typeof input === 'object', 'Invalid activity actor or request');
    for (const value of [input.sessionId, input.requestId, input.contextId, input.activityId]) valid(identifier(value), 'Invalid activity identity');
    valid(['start', 'note', 'finish'].includes(input.action), 'Invalid activity action');
    valid(typeof input.text === 'string' && input.text.length > 0 && input.text.length <= 8192, 'Invalid activity text');
    valid(input.expectedVersion === null || (typeof input.expectedVersion === 'string' && input.expectedVersion.length <= 2048), 'Invalid activity version');
    const requires = input.requires ?? [];
    valid(Array.isArray(requires) && requires.length <= 32, 'Invalid activity dependencies');
    for (const r of requires) valid(r && typeof r.elementId === 'string' && r.elementId.length > 0 && r.elementId.length <= 1024 &&
      (r.version === null || (typeof r.version === 'string' && r.version.length <= 2048)), 'Invalid activity dependency');
    valid(new Set(requires.map(r => r.elementId)).size === requires.length, 'Duplicate activity dependency');
    // Own and normalize all caller data before it enters the asynchronous queue.
    const request = { sessionId: input.sessionId, requestId: input.requestId, contextId: input.contextId,
      activityId: input.activityId, action: input.action, text: input.text, expectedVersion: input.expectedVersion,
      requires: requires.map(r => ({ elementId: r.elementId, version: r.version })).sort((a, b) => a.elementId.localeCompare(b.elementId)) };
    const fingerprint = hash({ actor, ...request, protocol: participationProtocol });
    const operationId = `shared:operation:${hash({ actor, sessionId: request.sessionId, requestId: request.requestId })}`;
    const id = activityKey(actor, request.contextId, request.activityId);
    if (this.pending >= 64) return Promise.reject(new OsgError('ACTIVITY_BUSY', 'Activity queue is full'));
    this.pending++;
    const work = this.queue.then(async () => {
      for (let attempt = 0; attempt < 8; attempt++) {
        const view = await this.view();
        const previous = view.state.get(operationId);
        if (previous) {
          if (props(previous).fingerprint !== fingerprint) throw new OsgError('ACTIVITY_CONFLICT', 'Request ID reused with different content');
          return { head: view.head, appliedHead: previous.commit_id!, activityId: id,
            version: `${id}@${previous.commit_id}`, idempotent: true };
        }
        const current = view.state.get(id);
        if ((current?.row_key ?? null) !== request.expectedVersion) throw new OsgError('ACTIVITY_CONFLICT', 'Activity version changed');
        if (request.action === 'start' ? !!current : !current || props(current).state !== 'active')
          throw new OsgError('ACTIVITY_CONFLICT', 'Activity lifecycle conflict');
        for (const dependency of request.requires) {
          if ((view.state.get(dependency.elementId)?.row_key ?? null) !== dependency.version)
            throw new OsgError('ACTIVITY_CONFLICT', 'Activity dependency changed');
        }
        const value = { protocol: participationProtocol, actor, contextId: request.contextId, activityId: request.activityId,
          sessionId: request.sessionId, state: request.action === 'finish' ? 'finished' : 'active', text: request.text,
          startedAtHead: current ? props(current).startedAtHead : view.head,
          basedOnHead: view.head, requires: request.requires };
        const actorId = `shared:actor:${hash({ actor })}`, contextId = `shared:context:${hash({ contextId: request.contextId })}`;
        const relation = (predicate: string, dst: string, suffix = '', details: Record<string, unknown> = {}): Proposal => ({
          ...fact(`shared:relation:${hash({ id, predicate, dst, suffix })}`, 'shared_relation', details), src: id, dst, predicate
        });
        const proposals = [fact(actorId, 'shared_actor', { actor }), fact(contextId, 'shared_context', { contextId: request.contextId }),
          fact(id, 'shared_activity', value), fact(operationId, 'shared_operation', { fingerprint, activityId: id, protocol: participationProtocol }),
          relation('started_by', actorId), relation('in_context', contextId),
          ...request.requires.filter(r => r.version !== null).map(r => relation('used_version', r.elementId, operationId, { version: r.version, requestId: request.requestId }))];
        try {
          const applied = await commit(this.store, proposals, actor, 'main', view.head, view);
          const written = await this.store.rowsOfCommits([applied.commitId]);
          const metadata = this.store.commitRow ? await this.store.commitRow(applied.commitId) :
            (await this.store.commitRows()).find(r => r.commit_id === applied.commitId);
          if (!metadata) throw new OsgError('VERIFY_FAILED', 'Missing activity publication metadata');
          const state = new Map(view.state), commits = new Map(view.commits);
          applyDelta(state, written); commits.set(applied.commitId, metadata);
          this.cached = { head: applied.commitId, state, commits };
          rememberCommittedView(this.store, this.cached);
          return { head: applied.commitId, appliedHead: applied.commitId, activityId: id,
            version: `${id}@${applied.commitId}`, idempotent: false };
        } catch (error) {
          // Another process can publish the identical operation after our head read but
          // before the adapter's append-only key check. Reload the durable request result.
          const duplicate = error instanceof OsgError && error.code === 'INVALID_DELTA' && error.message === 'Duplicate or mutable row key';
          if (!(error instanceof OsgError) || (error.code !== 'STALE_HEAD' && !duplicate)) throw error;
        }
      }
      throw new OsgError('STALE_HEAD', 'Activity contention retry budget exceeded');
    });
    this.queue = work.catch(() => {}).finally(() => { this.pending--; });
    return work;
  }
}
