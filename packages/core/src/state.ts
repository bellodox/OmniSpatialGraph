// Copyright 2026 Vlad Bellomorski
// SPDX-License-Identifier: Apache-2.0

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { OsgError, type GraphPort, type GraphRow } from '../../contracts/src/index.js';
import { snapshot, type HeadView } from './graph.js';

/** Derived cache of the current state at one commit. Rebuildable; never authoritative. */
export interface StateCache { read(): Promise<unknown>; write(value: unknown): Promise<void>; }
interface CacheFile { schemaVersion: 1; head: string; digest: string; rows: GraphRow[]; }

const digestOf = (rows: Iterable<GraphRow>) => bytesToHex(sha256(new TextEncoder().encode([...rows].map((row) => row.row_key).sort().join('\n'))));

function valid(value: unknown): value is CacheFile {
  const file = value as CacheFile | null;
  return !!file && file.schemaVersion === 1 && typeof file.head === 'string' && /^c[0-9a-f]{64}$/.test(file.head) &&
    typeof file.digest === 'string' && Array.isArray(file.rows) && digestOf(file.rows) === file.digest;
}

/** Apply one commit's rows to a state in place, matching snapshot() for rows without valid_to. */
export function applyDelta(state: Map<string, GraphRow>, rows: GraphRow[]): void {
  for (const row of rows) {
    if (row.op === 'retract') state.delete(row.element_id);
    else state.set(row.element_id, row);
  }
}

/** Current state at the head of main: from the cache plus the commits written since, else from all rows. */
export async function headView(store: GraphPort, cache?: StateCache): Promise<HeadView> {
  const head = await store.head('main');
  if (head == null) throw new OsgError('NOT_INITIALIZED', 'Graph is not initialized');
  const commits = new Map((await store.commitRows()).map((row) => [row.commit_id!, row]));
  if (head === 'ROOT') return { head, state: new Map(), commits };
  let loaded: CacheFile | null = null;
  if (cache) {
    try { const value = await cache.read(); if (valid(value)) loaded = value; } catch { loaded = null; }
  }
  // Local cache bytes can be replaced with an equally well-formed digest. Rebuild from committed rows;
  // neither a matching head nor cached row keys prove the status or text of a cached row.
  const state = snapshot(await store.rows(), head).state;
  if (cache && (loaded?.head !== head || loaded.rows.length !== state.size ||
      loaded.rows.some((row) => JSON.stringify(state.get(row.element_id)) !== JSON.stringify(row)))) {
    try { await cache.write({ schemaVersion: 1, head, digest: digestOf(state.values()), rows: [...state.values()] } satisfies CacheFile); }
    catch { /* derived data */ }
  }
  return { head, state, commits };
}
