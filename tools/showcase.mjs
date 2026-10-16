// Copyright 2026 Vlad Bellomorski
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = process.argv[2];
if (!bin) throw new Error('Usage: node tools/showcase.mjs <installed osg bin path>');
const fixture = fileURLToPath(new URL('../fixtures/showcase/', import.meta.url));
const task = 'Improve greet trim whitespace reject blank names';
const symbol = 'code:symbol:src/greet.js#greet';
const workspace = await mkdtemp(path.join(tmpdir(), 'osg-showcase-'));
const markerA = `A-${randomUUID()}`;
const markerB = `B-${randomUUID()}`;

function processRun(executable, args, cwd = workspace) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.signal, null, `deadline: ${args[0]}`);
  return result;
}

function osg(command, args = []) {
  const result = processRun(process.execPath, [bin, command, ...(command === 'export' ? ['episodes'] : []),
    '--workspace', workspace, ...args, '--json']);
  assert.equal(result.stdout.trim().split('\n').length, 1, result.stderr);
  const packet = JSON.parse(result.stdout);
  assert.equal(result.status, 0, `${command}: ${result.stderr}`);
  assert.equal(packet.ok, true);
  return { packet, bytes: result.stdout.trim().length };
}

function tests(expectedPass, expectedFail) {
  const result = processRun(process.execPath, ['--test', 'checks.mjs']);
  const transcript = `${result.stdout}\n${result.stderr}`;
  assert.equal(Number(/[ℹ#] pass (\d+)/.exec(transcript)?.[1]), expectedPass, transcript);
  assert.equal(Number(/[ℹ#] fail (\d+)/.exec(transcript)?.[1]), expectedFail, transcript);
  assert.equal(result.status, expectedFail ? 1 : 0);
  return { pass: expectedPass, fail: expectedFail, exit: result.status };
}

function retrieved(packet, marker) {
  const item = packet.data.items.find((entry) => entry.kind === 'episode' && entry.data.value.decision.includes(marker));
  assert.ok(item, `missing independently written ${marker}`);
  assert.equal(item.provenance.status, 'hypothesis');
  assert.equal(item.data.untrusted, true);
  assert.deepEqual(item.data.value.entities, [symbol]);
  return item.elementId;
}

try {
  await cp(fixture, workspace, { recursive: true });
  osg('init');
  const initial = osg('sync').packet.graphCommitId;
  const red = tests(4, 4);
  const a = osg('remember', ['--task', task, '--decision', `${markerA} RED reproduced; trim and reject blank`,
    '--outcome', '4 pass 4 fail', '--entities', symbol]).packet;
  const bFirst = osg('context', ['--task', task, '--max-tokens', '800']);
  assert.ok(bFirst.bytes <= 3200);
  assert.equal(retrieved(bFirst.packet, markerA), a.data.episodeId);
  const beforeEdit = osg('history', ['--entity', symbol]).packet;
  assert.equal(beforeEdit.data.versions.length, 1);
  assert.equal(beforeEdit.data.versions[0].commitId, initial);
  const sourcePath = path.join(workspace, 'src/greet.js');
  const oldSource = await readFile(sourcePath, 'utf8');
  assert.equal(oldSource, '// Copyright 2026 Vlad Bellomorski\n// SPDX-License-Identifier: Apache-2.0\n\nexport function greet(name) {\n  return `Hello, ${name}!`;\n}\n');
  await writeFile(sourcePath, '// Copyright 2026 Vlad Bellomorski\n// SPDX-License-Identifier: Apache-2.0\n\nexport function greet(name) {\n  if (typeof name !== "string" || !name.trim()) throw new TypeError("Name required");\n  return `Hello, ${name.trim()}!`;\n}\n');
  const green = tests(8, 0);
  const stale = osg('context', ['--entity', symbol]).packet;
  assert.equal(stale.data.items.find((entry) => entry.elementId === symbol).citation.stale, true);
  assert.equal(stale.graphCommitId, a.graphCommitId);
  const changed = osg('sync').packet.graphCommitId;
  const b = osg('remember', ['--task', task, '--decision', `${markerB} GREEN verified after edit`,
    '--outcome', '8 pass 0 fail', '--entities', symbol]).packet;
  const cFirst = osg('context', ['--task', task, '--max-tokens', '800']);
  assert.ok(cFirst.bytes <= 3200);
  assert.equal(retrieved(cFirst.packet, markerA), a.data.episodeId);
  assert.equal(retrieved(cFirst.packet, markerB), b.data.episodeId);
  assert.ok(cFirst.packet.data.items.some((entry) => entry.elementId === symbol && entry.citation.stale === false));
  const cTests = tests(8, 0);
  const history = osg('history', ['--entity', symbol]).packet.data;
  assert.equal(history.versions.length, 2);
  assert.equal(history.versions[1].supersedes, history.versions[0].rowKey);
  assert.equal(history.versions[1].commitId, changed);
  const verified = osg('verify').packet.data;
  const replay = osg('export').packet.data;
  assert.equal(replay.episodes, 2);
  const noop = osg('sync').packet;
  assert.equal(noop.data.noop, true);
  assert.equal(noop.graphCommitId, b.graphCommitId);
  console.log(JSON.stringify({ red, green, cTests, markerA, markerB, episodeA: a.data.episodeId,
    episodeB: b.data.episodeId, initial, changed, finalHead: b.graphCommitId, contextBytes: cFirst.bytes,
    estimatedTokens: cFirst.packet.data.estimatedTokens, verified, noop: noop.data.noop, exportEpisodes: replay.episodes }));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
