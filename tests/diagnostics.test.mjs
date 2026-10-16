// Copyright 2026 Vlad Bellomorski
// SPDX-License-Identifier: Apache-2.0

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { moduleHooks } from './module-hooks.mjs';

const entry = process.env.OSG_TEST_PUBLIC_BIN ?? path.resolve('dist/cli/src/public.js');
const secret = 'private-unique-diagnostic-marker';

function run(command, workspace, args = [], hook) {
  const result = spawnSync(process.execPath, [...(hook ? ['--import', moduleHooks(hook)] : []),
    entry, command, ...(command === 'export' ? ['episodes'] : []), '--workspace', workspace, ...args, '--json'],
  { encoding: 'utf8', timeout: 30000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  const envelope = JSON.parse(result.stdout);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  if (!envelope.ok) {
    assert.ok(result.stderr.includes(envelope.error.code));
    assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
    assert.ok(!`${result.stdout}${result.stderr}`.includes(workspace));
  }
  return { ...envelope, exit: result.status, stderr: result.stderr };
}

test('usage, filesystem and native diagnostic streams reject echoed inputs and causes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'osg-diagnostics-'));
  try {
    assert.equal(run(secret, root).exit, 9);
    assert.equal(run('init', path.join(root, secret)).exit, 5);
    assert.equal(run('context', root, [`--${secret}`]).exit, 2);
    const hook = `const hooks = {resolve(specifier,context,next) {
      if(specifier==='@lancedb/lancedb') throw new Error(${JSON.stringify(`native ${secret} ${root}`)});
      return next(specifier,context);
    }};`;
    const native = run('init', root, [], hook);
    assert.equal(native.exit, 6);
    assert.equal(native.error.code, 'STORAGE_UNAVAILABLE');
    assert.match(native.error.message, /adapter/);
    assert.equal(native.error.category, 'storage');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('post-commit export error retains recovery commit without exposing filesystem cause', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'osg-diagnostics-export-'));
  try {
    await writeFile(path.join(root, 'source.ts'), 'export function greet() { return 1; }\n');
    assert.equal(run('init', root).exit, 0);
    assert.equal(run('sync', root).exit, 0);
    await mkdir(path.join(root, '.osg/export/episodes.jsonl'), { recursive: true });
    const result = run('remember', root, ['--task', 'greet', '--decision', secret, '--outcome', 'recorded', '--entities', 'code:symbol:source.ts#greet']);
    assert.equal(result.exit, 6);
    assert.equal(result.error.code, 'STORAGE_UNAVAILABLE');
    assert.equal(result.error.details.commitId, result.graphCommitId);
    assert.match(result.graphCommitId, /^c[0-9a-f]{64}$/);
    await rm(path.join(root, '.osg/export/episodes.jsonl'), { recursive: true });
    assert.equal(run('export', root).exit, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('scanner warning paths and third-party stderr are redacted while warning codes survive', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'osg-diagnostics-warnings-'));
  try {
    await writeFile(path.join(root, 'source.ts'), 'export function greet() {}\n');
    await writeFile(path.join(root, `${secret}.ts`), 'export function duplicate() {}\nexport function duplicate() {}\n');
    assert.equal(run('init', root).exit, 0);
    const nativeMessage = `external warning ${root} ${secret}`;
    const hook = `import { writeSync } from 'node:fs';
    const hooks = {resolve(specifier,context,next) {
      if(specifier==='ignore') writeSync(2, ${JSON.stringify(nativeMessage)});
      return next(specifier,context);
    }};`;
    const synced = run('sync', root, [], hook);
    assert.equal(synced.exit, 0);
    assert.ok(synced.warnings.some((warning) => warning.code === 'AMBIGUOUS_DECLARATION'));
    assert.ok(!JSON.stringify(synced.warnings).includes(secret));
    assert.ok(!synced.stderr.includes(secret));
  } finally { await rm(root, { recursive: true, force: true }); }
});
