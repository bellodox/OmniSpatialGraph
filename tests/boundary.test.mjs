// Copyright 2026 Vlad Bellomorski
// SPDX-License-Identifier: Apache-2.0

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// The same regressions run against the installed package's declared bin during consumer proof.
const entry = process.env.OSG_TEST_PUBLIC_BIN ?? path.resolve('dist/cli/src/public.js');
const secret = 'C:/private-native-path/unique-boundary-secret';

function run(args, workerHook = '') {
  const hook = `if (process.send || process.argv[1]?.endsWith('index.js')) { ${workerHook} }`;
  const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(hook)}`, entry, ...args],
    { encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
  return result;
}

function packet(result, exit) {
  assert.equal(result.status, exit, result.stderr);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.schemaVersion, 1);
  assert.match(envelope.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(envelope.ok, exit === 0);
  return envelope;
}

test('public boundary captures actual fd1/fd2 and preload JS output without corrupting JSON', () => {
  const hook = `const fs = await import('node:fs'); fs.writeSync(1, ${JSON.stringify(secret)}); fs.writeSync(2, ${JSON.stringify(secret)}); process.stdout.write(${JSON.stringify(secret)}); process.stderr.write(${JSON.stringify(secret)});`;
  const result = run(['help', '--json'], hook);
  assert.ok(packet(result, 0).data.commands.includes('remember'));
  assert.match(result.stderr, /WORKER_DIAGNOSTIC_REDACTED/);
  assert.ok(result.stderr.length < 300);
});

test('public boundary reports pre-main failure honestly instead of leaking raw startup error', () => {
  const result = run(['help', '--json'], `throw new Error(${JSON.stringify(secret)});`);
  const envelope = packet(result, 1);
  assert.equal(envelope.error.code, 'INTERNAL');
  assert.equal(envelope.error.category, 'internal');
  assert.equal(envelope.workspaceId, null);
  assert.equal(envelope.graphCommitId, null);
  assert.match(result.stderr, /worker|Worker/);
});

test('missing, malformed and duplicate worker results never report success', () => {
  for (const hook of ['process.exit(0);', 'process.send({ok:true}); process.exit(0);', 'process.send({ok:true});']) {
    const envelope = packet(run(['help', '--json'], hook), 1);
    assert.equal(envelope.error.code, 'INTERNAL');
  }
});

test('public boundary bounds flood output and terminates an otherwise hanging worker', () => {
  const result = run(['help', '--json'], `const fs = await import('node:fs'); for(let i=0;i<300;i++) fs.writeSync(2, 'x'.repeat(8192)); setInterval(()=>{},1000);`);
  assert.equal(packet(result, 1).error.code, 'INTERNAL');
  assert.ok(result.stderr.length < 300);
});

test('public help retains every operation and non-JSON usage; usage exits remain distinct', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0);
  for (const command of ['help', 'init', 'sync', 'remember', 'context', 'history', 'verify', 'export episodes']) assert.ok(help.stdout.includes(command));
  assert.ok(help.stdout.includes('--workspace'));
  assert.ok(!help.stdout.startsWith('{'));
  assert.equal(packet(run(['context', '--json']), 2).error.code, 'USAGE');
  assert.equal(packet(run(['unsupported', '--json']), 9).error.code, 'UNSUPPORTED_OPERATION');
});
