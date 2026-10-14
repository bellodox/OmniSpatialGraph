import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../dist/storage-lance/src/index.js';
import * as lance from '@lancedb/lancedb';
import { commit, snapshot, verify } from '../dist/core/src/graph.js';

test('null valid-from supersession and retraction preserve current and valid-time state', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'osg-null-time-'));
  try {
    const store = await openStore(directory, true);
    const first = await commit(store, [fact('null.ts', 1, null)], 'provider');
    const second = await commit(store, [fact('null.ts', 2, null)], 'provider');
    const rows = await store.rows();
    assert.equal(snapshot(rows, first.commitId).state.get('code:file:null.ts').props, '{"value":1}');
    for (const validAt of [null, -100, 0, 100]) {
      assert.equal(snapshot(rows, second.commitId, validAt).state.get('code:file:null.ts').props, '{"value":2}');
    }
    assert.deepEqual(verify(rows), { commits: 2, elements: 2 });
    const third = await commit(store, [{ ...fact('null.ts', 2, null), op: 'retract' }], 'provider');
    for (const validAt of [null, -100, 0, 100]) assert.equal(snapshot(await store.rows(), third.commitId, validAt).state.size, 0);
    assert.deepEqual(verify(await store.rows()), { commits: 3, elements: 3 });
    await assert.rejects(commit(store, [{ ...fact('null.ts', 2, null), op: 'retract' }], 'provider'), { code: 'INVALID_DELTA' });
    const restored = await commit(store, [fact('null.ts', 3, null)], 'provider');
    assert.equal(snapshot(await store.rows(), restored.commitId).state.size, 1);
    assert.equal(verify(await store.rows()).commits, 4);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('initial creation includes ROOT in its first version and concurrent init preserves it', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'osg-init-'));
  try {
    const stores = await Promise.all(Array.from({ length: 4 }, () => openStore(directory, true)));
    for (const store of stores) assert.equal(await store.head('main'), 'ROOT');
    const connection = await lance.connect(directory, { readConsistencyInterval: 0 });
    const table = await connection.openTable('graph');
    assert.equal((await table.listVersions()).length, 1, 'ROOT must be initial data, not a second append');
    assert.equal((await stores[0].rows()).length, 1);
    await commit(stores[0], [fact('keep.ts', 1)], 'provider');
    const before = await stores[0].rows();
    assert.deepEqual(await (await openStore(directory, true)).rows(), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('interrupted legacy init leaves a headless table that fails honestly without mutation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'osg-headless-'));
  try {
    const initialized = await openStore(directory, true);
    const connection = await lance.connect(directory, { readConsistencyInterval: 0 });
    const table = await connection.openTable('graph');
    await table.delete("row_key = 'head:main'");
    assert.deepEqual(await initialized.rows(), []);
    const versionCount = (await table.listVersions()).length;
    for (const create of [true, false]) {
      await assert.rejects(openStore(directory, create), { code: 'NOT_INITIALIZED', message: /head/i });
    }
    assert.equal((await table.listVersions()).length, versionCount);
    assert.deepEqual(await table.query().toArray(), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

const fact = (name, value, from = 1) => ({ element_id: `code:file:${name}`, kind: 'file', op: 'assert', status: 'observed',
  src: null, dst: null, predicate: null, extent: null, props: { value }, source_hash: null,
  valid_from: from, valid_to: null, observed_at: from });

test('atomic CAS, noop, immutable history, late retry and reference integrity', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'osg-graph-'));
  try {
    const first = await openStore(directory, true);
    assert.equal(await first.head('main'), 'ROOT');
    const one = await commit(first, [fact('a.ts', 1)], 'provider');
    assert.match(one.commitId, /^c[0-9a-f]{64}$/);
    const initial = JSON.stringify(snapshot(await first.rows(), one.commitId).state.get('code:file:a.ts'));
    const same = await commit(first, [fact('a.ts', 1, 2)], 'provider');
    assert.equal(same.noop, true);
    assert.equal(same.commitId, one.commitId);
    const a = await openStore(directory), b = await openStore(directory);
    const race = await Promise.allSettled([
      commit(a, [fact('a.ts', 2, 3)], 'writer-a', 'main', one.commitId),
      commit(b, [fact('a.ts', 3, 3)], 'writer-b', 'main', one.commitId)
    ]);
    assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(race.filter((result) => result.status === 'rejected' && result.reason.code === 'STALE_HEAD').length, 1);
    const winner = race.find((result) => result.status === 'fulfilled').value;
    assert.equal(await first.head('main'), winner.commitId);
    assert.equal(JSON.stringify(snapshot(await first.rows(), one.commitId).state.get('code:file:a.ts')), initial);
    const retry = await commit(first, [fact('a.ts', 2, 3)], 'writer-a', 'main', one.commitId).catch((error) => error);
    if (winner === race[0].value) assert.equal(retry.idempotent, true);
    else assert.equal(retry.code, 'STALE_HEAD');
    assert.ok(verify(await first.rows()).commits >= 2);
    const tampered = (await first.rows()).map((row) => ({ ...row }));
    tampered.find((row) => row.row_type === 'elem').props = '{"value":999}';
    assert.throws(() => verify(tampered), { code: 'VERIFY_FAILED' });
    const brokenParent = (await first.rows()).map((row) => ({ ...row }));
    brokenParent.find((row) => row.row_type === 'commit' && row.commit_id === winner.commitId).parents = '["missing"]';
    assert.throws(() => verify(brokenParent), { code: 'VERIFY_FAILED' });
    await assert.rejects(commit(first, [{ ...fact('a.ts', 4), supersedes: 'wrong' }], 'provider'), { code: 'INVALID_DELTA' });
    await assert.rejects(commit(first, [{ ...fact('a.ts', 4), element_id: 'code:edge:links|code:file:a.ts|code:file:absent',
      kind: 'links', src: 'code:file:a.ts', dst: 'code:file:absent', predicate: 'links' }], 'provider'), { code: 'INVALID_DELTA' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('ten independent native two-writer CAS races publish only one reachable state', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'osg-races-'));
  try {
    const reader = await openStore(directory, true);
    for (let round = 0; round < 10; round++) {
      const parent = await reader.head('main');
      const [a, b] = await Promise.all([openStore(directory), openStore(directory)]);
      const results = await Promise.allSettled([
        commit(a, [fact('shared.ts', `a${round}`, round + 1)], 'agent-a', 'main', parent),
        commit(b, [fact('shared.ts', `b${round}`, round + 1)], 'agent-b', 'main', parent)
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1, `round ${round}`);
      assert.equal(results.filter((result) => result.status === 'rejected' && result.reason.code === 'STALE_HEAD').length, 1, `round ${round}`);
      const winner = results.find((result) => result.status === 'fulfilled').value;
      const view = snapshot(await reader.rows(), await reader.head('main'));
      assert.equal(view.state.get('code:file:shared.ts').commit_id, winner.commitId);
    }
    assert.equal(verify(await reader.rows()).commits, 10);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
