// Copyright 2026 Vlad Bellomorski
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openStore } from '../dist/storage-lance/src/index.js';
import { commit, verify } from '../dist/core/src/graph.js';

const object = { element_id: 'phys:object:cup', kind: 'object', op: 'assert', status: 'observed',
  src: null, dst: null, predicate: null, props: { name: 'cup' }, source_hash: null,
  valid_from: 1, valid_to: null, observed_at: 1,
  extent: { frame_id: 'phys:frame:lab', t: [1, 2, 3], q: [0, 0, 0, 1000000], ext_min: [-1, -1, 0], ext_max: [1, 1, 2] } };

const mutations = {
  array: (rows) => { rows.pop(); },
  row: (rows) => { rows.find((row) => row.row_type === 'elem').props = '{"name":"poisoned"}'; },
  extent: (rows) => {
    const extent = rows.find((row) => row.row_type === 'elem').extent;
    extent.frame_id = 'phys:frame:poisoned';
    for (const field of ['t', 'q', 'ext_min', 'ext_max']) {
      extent[field][0] = 999;
      extent[field].push(999);
    }
  }
};

for (const cacheHit of [false, true]) for (const [name, mutate] of Object.entries(mutations)) {
  test(`rows isolates caller ${name} mutation on cache ${cacheHit ? 'hit' : 'miss'}`, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'osg-cache-isolation-'));
    try {
      const writer = await openStore(directory, true);
      await commit(writer, [object], 'fixture');
      const expected = await writer.rows();
      const reader = await openStore(directory);
      if (cacheHit) await reader.rows();
      const returned = await reader.rows();
      mutate(returned);
      const next = await reader.rows();
      assert.notStrictEqual(next, returned);
      assert.deepEqual(next, expected, 'caller mutations must not affect subsequent reads');
      assert.deepEqual(await (await openStore(directory)).rows(), expected, 'disk remains unchanged');
      assert.deepEqual(verify(next), { commits: 1, elements: 1 });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

test('rows invalidates its cache after a separate process publishes without changing prior history', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'osg-cache-external-'));
  try {
    const reader = await openStore(directory, true);
    await commit(reader, [object], 'fixture');
    const before = await reader.rows();
    assert.deepEqual(await reader.rows(), before);
    const worker = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { openStore } from ${JSON.stringify(new URL('../dist/storage-lance/src/index.js', import.meta.url).href)};
      import { commit } from ${JSON.stringify(new URL('../dist/core/src/graph.js', import.meta.url).href)};
      const store = await openStore(process.argv[1]);
      await commit(store, [${JSON.stringify({ ...object, props: { name: 'moved' }, valid_from: 2, observed_at: 2 })}], 'external');
    `, directory], { encoding: 'utf8' });
    assert.equal(worker.status, 0, worker.stderr);
    const after = await reader.rows();
    assert.equal(after.length, before.length + 2);
    assert.notEqual(after.find((row) => row.row_type === 'head').head, before.find((row) => row.row_type === 'head').head);
    for (const row of before.filter((row) => row.row_type !== 'head')) {
      assert.deepEqual(after.find((current) => current.row_key === row.row_key), row);
    }
    assert.deepEqual(after, await (await openStore(directory)).rows());
    assert.deepEqual(verify(after), { commits: 2, elements: 2 });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
