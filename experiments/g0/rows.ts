import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Schema, Field, Utf8 } from 'apache-arrow';
import { connect, makeArrowTable } from '@lancedb/lancedb';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const root = fileURLToPath(new URL('.', import.meta.url));
export const generated = join(root, '.generated');
export const tableName = 'graph_elements';
export interface GraphRow extends Record<string, unknown> {
  id: string; branch: string; kind: string; qualifiedName: string; disambiguator: string;
  payload: string; commitId: string; parents: string | null; deltaHash: string | null; actor: string | null;
}
export const schema = new Schema([
  ...['id', 'branch', 'kind', 'qualifiedName', 'disambiguator', 'payload', 'commitId'].map(name => new Field(name, new Utf8(), false)),
  ...['parents', 'deltaHash', 'actor'].map(name => new Field(name, new Utf8(), true)),
]);

// This fixture encoding validates qualified keys; it is not the production identity contract.
export function dataRow(kind: string, qualifiedName: string, disambiguator: string, payload: string, commitId: string): GraphRow {
  return { id: JSON.stringify([qualifiedName, kind, disambiguator]), branch: 'main', kind, qualifiedName, disambiguator, payload, commitId, parents: null, deltaHash: null, actor: null };
}

// Validate both fixture key encoding and composite uniqueness before every write.
export function assertUnique(rows: GraphRow[]): void {
  const keys = new Set<string>();
  for (const row of rows) {
    assert.equal(row.id, JSON.stringify([row.qualifiedName, row.kind, row.disambiguator]));
    const key = JSON.stringify([row.id, row.branch]);
    assert(!keys.has(key), `Duplicate qualified key: ${key}`);
    keys.add(key);
  }
}

// Hash ordered data rows only, avoiding self-reference through the marker.
export function makeBatch(rows: GraphRow[], commitId: string, parents: string[]): GraphRow[] {
  const marker = dataRow('marker', commitId, '0', '', commitId);
  marker.parents = JSON.stringify(parents);
  marker.deltaHash = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  marker.actor = 'g0-single-writer';
  const batch = [...rows, marker];
  assertUnique(batch);
  return batch;
}

// Partial rows fail independently of the marker equivalence.
export function assertAtomicVisibility(rows: number, markers: number, expected: number): void {
  assert(rows === 0 || rows === expected, `Partial batch: ${rows}/${expected}`);
  assert.equal(markers, rows === expected ? 1 : 0, 'Marker iff all batch rows');
}

// Each fixture creation is a separate baseline version, not a measured merge.
export async function baseline(path: string): Promise<number> {
  await mkdir(path, { recursive: true });
  const connection = await connect(path);
  try {
    const table = await connection.createTable(tableName, makeArrowTable([
      dataRow('entity', 'probe::existing', '0', 'old', 'baseline'),
      dataRow('edge', 'probe::unmatched', '0', 'keep', 'baseline'),
      ...makeBatch([], 'baseline', []),
    ], { schema }));
    try { return await table.version(); } finally { table.close(); }
  } finally { connection.close(); }
}

// Standalone probes persist evidence even if their assertions fail.
export async function record(name: string, probe: () => Promise<unknown>): Promise<void> {
  const path = join(root, 'runtime-evidence.json');
  let evidence: Record<string, unknown> = {};
  try { evidence = JSON.parse(await readFile(path, 'utf8')); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const startedAt = new Date().toISOString();
  const start = performance.now();
  try {
    const result = await probe();
    const status = result && typeof result === 'object' && 'outcome' in result && result.outcome === 'inconclusive' ? 'inconclusive' : 'passed';
    if (status === 'inconclusive') process.exitCode = 2;
    evidence[name] = { status, startedAt, finishedAt: new Date().toISOString(), elapsedMs: performance.now() - start, result };
  } catch (error) {
    evidence[name] = { status: 'failed', startedAt, finishedAt: new Date().toISOString(), elapsedMs: performance.now() - start, error: String(error), stack: error instanceof Error ? error.stack : undefined };
    process.exitCode = 1;
  }
  await writeFile(path, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ [name]: evidence[name] }, null, 2));
}
