import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { connect } from '@lancedb/lancedb';
import { generated, tableName, assertAtomicVisibility } from './rows.ts';

// A fresh reader process verifies recovery after the writer is fully gone.
const [fixture, countText, commitId] = process.argv.slice(2);
assert(fixture && /^crash-[\w-]+$/.test(fixture));
assert(commitId && /^crash-[\w-]+$/.test(commitId));
const expectedCount = Number(countText);
assert(Number.isInteger(expectedCount) && expectedCount > 0);
const events = (await readFile(join(generated, `${fixture}-events.jsonl`), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
const marker = events.find(event => event.phase === 'prepared').marker;
const connection = await connect(join(generated, fixture));
const table = await connection.openTable(tableName);
try {
  const version = await table.version();
  const rows = await table.countRows(`commitId = '${commitId}' AND kind != 'marker'`);
  const markers = await table.countRows(`commitId = '${commitId}' AND kind = 'marker'`);
  assertAtomicVisibility(rows, markers, expectedCount);
  assert.equal(await table.countRows("commitId = 'baseline'"), 3);
  assert.equal(await table.countRows(), 3 + rows + markers);
  assert.equal(version, rows === expectedCount ? 2 : 1);
  let checkedRows = 0;
  if (markers === 1) {
    const actualMarker = (await table.query().where(`commitId = '${commitId}' AND kind = 'marker'`).toArray())[0]!.toJSON();
    assert.deepEqual(actualMarker, marker);
    const keys = new Set<string>();
    for await (const chunk of table.query().where(`commitId = '${commitId}' AND kind != 'marker'`)) {
      for (const row of chunk.toArray()) {
        const index = Number(String(row.qualifiedName).replace('crash::row-', ''));
        assert(Number.isInteger(index) && index >= 0 && index < expectedCount);
        assert.equal(row.payload, `${index}:${'x'.repeat(1024)}`);
        assert.equal(row.kind, index % 2 ? 'edge' : 'entity');
        assert.equal(row.id, JSON.stringify([`crash::row-${index}`, row.kind, '0']));
        assert.equal(row.branch, 'main');
        assert(!keys.has(row.id));
        keys.add(row.id);
        checkedRows++;
      }
    }
    assert.equal(checkedRows, expectedCount);
  }
  await table.checkout(1);
  assert.equal(await table.countRows(), 3);
  assert.equal(await table.countRows(`commitId = '${commitId}'`), 0);
  assert.equal(await table.countRows("payload = 'keep'"), 1);
  console.log(JSON.stringify({ version, rows, markers, totalRows: rows + markers + 3, expectedCount, checkedRows, baselineHistoricalRows: 3, baselinePreserved: true, externalMapping: markers ? { [commitId]: version } : {}, atomic: true }));
} finally { table.close(); connection.close(); }
