// Copyright 2026 Vlad Bellomorski
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openStore } from '../dist/storage-lance/src/index.js';
import { commit } from '../dist/core/src/graph.js';

const cli = path.resolve('dist/cli/src/index.js');
const run = (workspace, ...args) => {
  const result = spawnSync(process.execPath, [cli, ...args, '--workspace', workspace, '--json'], { encoding: 'utf8' });
  return { status: result.status, json: JSON.parse(result.stdout) };
};
const python = 'class Store:\n    def save(self, name):\n        key = name.strip().lower()\n        return key\n\n    def load(self, name):\n        return name\n\ndef helper(x):\n    return x\n';
const legacySave = 'code:symbol:app/service.py#Store%2Esave';
const legacyLoad = 'code:symbol:app/service.py#Store%2Eload';
const nowMicros = () => Date.now() * 1000;

/** A workspace as the line-based parser left it: encoded method names, no body digests, config without a format. */
async function legacyWorkspace() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'osg-migrate-'));
  await mkdir(path.join(workspace, 'app'), { recursive: true });
  await writeFile(path.join(workspace, 'app/service.py'), python);
  assert.equal(run(workspace, 'init').status, 0);
  const sourceHash = createHash('sha256').update(python).digest('hex');
  const make = (element_id, kind, props, start, end, extra = {}) => ({ element_id, kind, op: 'assert', status: 'observed', src: null, dst: null, predicate: null,
    extent: { frame_id: 'code:file:app/service.py', t: null, q: null, ext_min: [start], ext_max: [end] }, props, source_hash: sourceHash,
    valid_from: nowMicros(), valid_to: null, observed_at: nowMicros(), ...extra });
  const edge = (id) => make(`code:edge:contains|code:file:app/service.py|${id}`, 'contains', { name: id, path: 'app/service.py' }, 1, 1,
    { src: 'code:file:app/service.py', dst: id, predicate: 'contains', extent: null, source_hash: null });
  const store = await openStore(path.join(workspace, '.osg/store'));
  await commit(store, [
    make('code:file:app/service.py', 'file', { name: 'app/service.py', path: 'app/service.py' }, 1, 10),
    make('code:symbol:app/service.py#Store', 'class', { name: 'Store', path: 'app/service.py' }, 1, 7),
    make(legacySave, 'method', { name: 'Store%2Esave', path: 'app/service.py' }, 2, 4),
    make(legacyLoad, 'method', { name: 'Store%2Eload', path: 'app/service.py' }, 6, 7),
    make('code:symbol:app/service.py#helper', 'function', { name: 'helper', path: 'app/service.py' }, 9, 10),
    edge('code:symbol:app/service.py#Store'), edge(legacySave), edge(legacyLoad), edge('code:symbol:app/service.py#helper')
  ], 'provider-tsc@0.1.0');
  const config = path.join(workspace, '.osg/config.json');
  const { format, ...legacy } = JSON.parse(await readFile(config, 'utf8'));
  assert.equal(format, 2);
  await writeFile(config, JSON.stringify(legacy));
  return workspace;
}
const configOf = async (workspace) => JSON.parse(await readFile(path.join(workspace, '.osg/config.json'), 'utf8'));
const withLegacy = (name, body) => test(name, async () => {
  const workspace = await legacyWorkspace();
  try { await body(workspace); } finally { await rm(workspace, { recursive: true, force: true }); }
});

withLegacy('an older workspace reads normally but sync is refused until migrated', async (workspace) => {
  assert.equal(run(workspace, 'remember', '--task', 'Save rules', '--decision', 'Lowercase keys', '--outcome', 'ok', '--entities', legacySave).json.data.resolved, 1);
  const blocked = run(workspace, 'sync');
  assert.equal(blocked.status, 4);
  assert.equal(blocked.json.error.code, 'MIGRATION_REQUIRED');
  assert.equal(run(workspace, 'context', '--entity', legacySave).status, 0);
  assert.equal(run(workspace, 'verify').status, 0);
  const doctor = run(workspace, 'doctor').json.data;
  assert.equal(doctor.ok, false);
  assert.equal(doctor.checks.find((check) => check.name === 'data format').ok, false);
});

withLegacy('migrate --dry-run reports the plan and changes nothing', async (workspace) => {
  const headBefore = run(workspace, 'verify').json.graphCommitId;
  const configBefore = await readFile(path.join(workspace, '.osg/config.json'), 'utf8');
  const plan = run(workspace, 'migrate', '--dry-run');
  assert.equal(plan.status, 0);
  assert.equal(plan.json.data.dryRun, true);
  assert.deepEqual(plan.json.data.pending.map((step) => step.id), ['tree-sitter-identities']);
  assert.equal(plan.json.data.plan.episodeLinksToCarryOver, 2);
  assert.equal(run(workspace, 'verify').json.graphCommitId, headBefore);
  assert.equal(await readFile(path.join(workspace, '.osg/config.json'), 'utf8'), configBefore);
  await assert.rejects(readdir(path.join(workspace, '.osg/backup')));
});

withLegacy('migrate backs up, carries episodes to the new identities, verifies and records the format', async (workspace) => {
  const saved = run(workspace, 'remember', '--task', 'Save rules', '--decision', 'Lowercase keys', '--outcome', 'ok', '--entities', legacySave);
  const result = run(workspace, 'migrate');
  assert.equal(result.status, 0, JSON.stringify(result.json.error));
  assert.equal(result.json.data.migrated, true);
  assert.equal(result.json.data.episodeLinksCarriedOver, 2);
  assert.match(result.json.data.backup, /-pre-migrate$/);
  assert.ok((await readdir(path.join(workspace, result.json.data.backup, 'store'))).length > 0);
  assert.equal((await configOf(workspace)).format, 2);
  const moved = run(workspace, 'context', '--entity', 'code:symbol:app/service.py#Store.save', '--max-tokens', '4000');
  assert.ok(moved.json.data.items.some((item) => item.elementId === saved.json.data.episodeId), 'episode follows the symbol to its new identity');
  assert.equal(run(workspace, 'verify').status, 0);
  assert.equal(run(workspace, 'sync').json.data.noop, true);
  const again = run(workspace, 'migrate');
  assert.equal(again.json.data.migrated, false);
  assert.equal(run(workspace, 'doctor').json.data.ok, true);
  // A later ordinary backup must not remove the pre-migration copy.
  for (let i = 0; i < 7; i++) assert.equal(run(workspace, 'backup').status, 0);
  assert.ok((await readdir(path.join(workspace, '.osg/backup'))).some((name) => name.endsWith('-pre-migrate')));
});

test('a workspace from a newer osg is refused by every command except help', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'osg-newer-'));
  try {
    assert.equal(run(workspace, 'init').status, 0);
    const config = path.join(workspace, '.osg/config.json');
    await writeFile(config, JSON.stringify({ ...(await configOf(workspace)), format: 3 }));
    for (const args of [['sync'], ['context', '--task', 'x'], ['verify'], ['migrate']]) {
      const result = run(workspace, ...args);
      assert.equal(result.status, 9, args.join(' '));
      assert.equal(result.json.error.code, 'UNSUPPORTED_FORMAT');
    }
    assert.equal(spawnSync(process.execPath, [cli, 'help', '--json'], { encoding: 'utf8' }).status, 0);
    await writeFile(config, JSON.stringify({ ...(await configOf(workspace)), format: 'x' }));
    assert.equal(run(workspace, 'verify').json.error.code, 'INVALID_SCHEMA');
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test('a new workspace starts at the current format and needs no migration', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'osg-fresh-'));
  try {
    await writeFile(path.join(workspace, 'a.ts'), 'export function a() { return 1; }\n');
    assert.equal(run(workspace, 'init').status, 0);
    assert.equal((await configOf(workspace)).format, 2);
    assert.equal(run(workspace, 'sync').status, 0);
    assert.equal(run(workspace, 'migrate').json.data.migrated, false);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});
