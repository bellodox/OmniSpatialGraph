import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect, makeArrowTable } from '@lancedb/lancedb';
import { dataRow, makeBatch, schema, generated, tableName } from './rows.ts';

// This dedicated child writes only a parent-created fixture beneath the experiment.
const [fixture, countText, commitId] = process.argv.slice(2);
assert(fixture && /^crash-[\w-]+$/.test(fixture));
assert(commitId && /^crash-[\w-]+$/.test(commitId));
const count = Number(countText);
assert(Number.isInteger(count) && count >= 1000 && count <= 300000);
const path = join(generated, fixture);
const journal = join(generated, `${fixture}-events.jsonl`);

// Synchronous local journal and IPC record acknowledgments without waiting on the controller.
function acknowledge(phase: string, extra: Record<string, unknown> = {}): void {
  const event = { phase, at: new Date().toISOString(), epochMs: Date.now(), pid: process.pid, ...extra };
  appendFileSync(journal, JSON.stringify(event) + '\n');
  process.send?.(event);
}

const connection = await connect(path);
const table = await connection.openTable(tableName);
try {
  const payload = 'x'.repeat(1024);
  const rows = Array.from({ length: count }, (_, index) => dataRow(index % 2 ? 'edge' : 'entity', `crash::row-${index}`, '0', `${index}:${payload}`, commitId));
  const batch = makeBatch(rows, commitId, ['baseline']);
  const arrow = makeArrowTable(batch, { schema });
  const merge = table.mergeInsert(['id', 'branch']).whenMatchedUpdateAll().whenNotMatchedInsertAll();
  acknowledge('prepared', { count, marker: batch.at(-1), arrowRows: arrow.numRows });
  await new Promise<void>(resolve => process.once('message', message => { assert.equal(message, 'go'); resolve(); }));
  acknowledge('before-sdk-invocation');
  const publication = merge.execute(arrow);
  acknowledge('sdk-promise-returned', { limitation: 'Public execute includes IPC serialization before native dispatch; disk observations are needed.' });
  const result = await publication;
  acknowledge('completed', { result, versionAfterPublication: await table.version() });
} catch (error) {
  acknowledge('failed', { error: String(error) });
  process.exitCode = 1;
} finally {
  table.close();
  connection.close();
  process.disconnect?.();
}
