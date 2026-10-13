import assert from 'node:assert/strict';
import { join } from 'node:path';
import { connect, makeArrowTable } from '@lancedb/lancedb';
import { baseline, dataRow, makeBatch, schema, generated, tableName, record, assertUnique } from './rows.ts';
import type { GraphRow } from './rows.ts';

// Compare complete persisted row values and qualified keys, independent of scan order.
function normalized(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(row => Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]])))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

// Two mixed batches must each publish one version, preserve unmatched rows, and reopen historically.
await record('batch', async () => {
  const path = join(generated, `batch-${Date.now()}`);
  const initialVersion = await baseline(path);
  const connection = await connect(path);
  const table = await connection.openTable(tableName);
  const snapshots = new Map<number, GraphRow[]>();
  const publications: unknown[] = [];
  try {
    let expected = (await table.query().limit(100).toArray()).map(row => row.toJSON()) as GraphRow[];
    snapshots.set(initialVersion, expected);
    for (let index = 1; index <= 2; index++) {
      const commitId = `commit-${index}`;
      const batch = makeBatch([
        dataRow('entity', 'probe::existing', '0', `updated-${index}`, commitId),
        dataRow('edge', `probe::insert-${index}`, '0', `calls-${index}`, commitId),
      ], commitId, [index === 1 ? 'baseline' : `commit-${index - 1}`]);
      assertUnique(expected);
      const before = await table.version();
      const versionsBefore = (await table.listVersions()).map(item => item.version);
      const startedAt = new Date().toISOString();
      const start = performance.now();
      const mergeResult = await table.mergeInsert(['id', 'branch']).whenMatchedUpdateAll().whenNotMatchedInsertAll().execute(makeArrowTable(batch, { schema }));
      const elapsedMs = performance.now() - start;
      const after = await table.version(); // Only after publication; never embedded in marker.
      const versionsAfter = (await table.listVersions()).map(item => item.version);
      assert.equal(after, before + 1);
      assert.equal(versionsAfter.length, versionsBefore.length + 1);
      assert.equal(versionsAfter.filter(version => !versionsBefore.includes(version)).length, 1);
      const updatedKeys = new Set(batch.map(row => row.id));
      expected = [...expected.filter(row => !updatedKeys.has(row.id)), ...batch];
      assertUnique(expected);
      snapshots.set(after, expected);
      assert.deepEqual(normalized((await table.query().limit(100).toArray()).map(row => row.toJSON())), normalized(expected));
      publications.push({ commitId, before, after, versionsBefore, versionsAfter, mergeResult, startedAt, elapsedMs, expectedRows: expected.length, marker: batch.at(-1), externalMapping: { [commitId]: after } });
    }
  } finally { table.close(); connection.close(); }
  const reopened = await connect(path);
  const current = await reopened.openTable(tableName);
  const historical: unknown[] = [];
  try {
    const currentVersion = await current.version();
    for (const [version, expected] of snapshots) {
      await current.checkout(version);
      assert.equal(await current.version(), version);
      const actual = (await current.query().limit(100).toArray()).map(row => row.toJSON());
      assert.deepEqual(normalized(actual), normalized(expected));
      assert.equal(await current.countRows("payload = 'keep'"), 1);
      const markers = expected.filter(row => row.kind === 'marker').map(row => ({ id: row.qualifiedName, parents: row.parents, deltaHash: row.deltaHash, actor: row.actor }));
      historical.push({ version, rowCount: actual.length, markers, exactContentsMatch: true, unmatchedRowPreserved: true });
    }
    await current.checkoutLatest();
    assert.equal(await current.version(), currentVersion);
    return { baselineVersion: initialVersion, currentVersion, publications, reopenedCurrentAndHistorical: historical, schema: 'Explicit Utf8 fields, nullable semantic marker fields; no embeddings or native version field', singleWriter: true };
  } finally { current.close(); reopened.close(); }
});
