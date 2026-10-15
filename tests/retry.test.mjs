import assert from 'node:assert/strict';
import test from 'node:test';
import { blankRow } from '../dist/contracts/src/index.js';
import { remember, sync } from '../dist/core/src/memory.js';

for (const operation of ['sync', 'remember']) {
  test(`${operation} stops after three stale-head retries with 50-250ms jitter`, async (t) => {
    const delays = [];
    t.mock.method(Math, 'random', () => 0.5);
    t.mock.method(globalThis, 'setTimeout', (done, delay) => {
      delays.push(delay);
      queueMicrotask(done);
    });
    let publications = 0;
    let extractions = 0;
    const root = blankRow({ row_key: 'head:main', row_type: 'head', branch: 'main', head: 'ROOT' });
    const store = {
      head: async () => 'ROOT',
      rows: async () => [structuredClone(root)],
      publish: async () => { publications++; return false; }
    };
    const execute = operation === 'remember'
      ? () => remember(store, 'retry contract', 'bounded retries', 'rejected', [])
      : () => sync(store, async () => {
        extractions++;
        return { facts: [{ element_id: 'code:file:retry.ts', kind: 'file', op: 'assert', status: 'observed',
          src: null, dst: null, predicate: null, extent: null, props: { name: 'retry' }, source_hash: null,
          valid_from: 1, valid_to: null, observed_at: 1 }], warnings: [], files: 1 };
      });
    await assert.rejects(execute(), { code: 'STALE_HEAD' });
    assert.equal(publications, 4, 'one initial attempt plus at most three retries');
    assert.deepEqual(delays, [150, 150, 150], 'jitter stays within the contract and no sleep follows exhaustion');
    if (operation === 'sync') assert.equal(extractions, 4, 'each retry re-extracts and re-diffs');
    assert.equal(await store.head('main'), 'ROOT');
    assert.deepEqual(await store.rows(), [root]);
  });
}
