// Copyright 2026 Vlad Bellomorski
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildIndex, decodeIndex, embeddableText, encodeIndex, nearest, context, headView, minSimilarity } from '../dist/core/src/index.js';
import { openStore } from '../dist/storage-lance/src/index.js';
import { moduleHooks } from './module-hooks.mjs';

const cli = path.resolve('dist/cli/src/index.js');
const run = (workspace, ...args) => {
  const result = spawnSync(process.execPath, [cli, ...args, '--workspace', workspace, '--json'], { encoding: 'utf8' });
  return { status: result.status, json: JSON.parse(result.stdout) };
};
const ok = (workspace, ...args) => { const result = run(workspace, ...args); assert.equal(result.status, 0, JSON.stringify(result.json.error)); return result.json; };

// Words in one group share a direction, so "authenticate" and "verify" are close without sharing a letter.
const groups = [['verify', 'authenticate', 'login', 'credentials'], ['hash', 'digest'], ['session', 'visit']];
const dimension = 8;
const embedder = {
  id: 'fake@test', dimension,
  async embed(texts) {
    return texts.map((text) => {
      const vector = new Float32Array(dimension);
      for (const word of text.toLowerCase().split(/[^a-z]+/).filter(Boolean)) {
        const group = groups.findIndex((names) => names.includes(word));
        vector[group >= 0 ? group : 3 + (word.length % 5)] += 1;
      }
      const length = Math.hypot(...vector) || 1;
      return vector.map((value) => value / length);
    });
  }
};

async function fixture() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'osg-embeddings-'));
  await mkdir(path.join(workspace, 'src'), { recursive: true });
  await writeFile(path.join(workspace, 'src/login.ts'), 'export function verifyPassword(u: string) { return u.length > 0; }\nexport function unrelatedThing() { return 1; }\n');
  ok(workspace, 'init');
  ok(workspace, 'sync');
  return workspace;
}
const withFixture = (name, body) => test(name, async () => {
  const workspace = await fixture();
  try { await body(workspace); } finally { await rm(workspace, { recursive: true, force: true }); }
});
const openState = async (workspace) => {
  const store = await openStore(path.join(workspace, '.osg/store'));
  return { store, view: await headView(store) };
};

withFixture('the index covers symbols and episodes, reuses unchanged vectors and drops removed ones', async (workspace) => {
  ok(workspace, 'remember', '--task', 'Fix login credentials', '--decision', 'Check them first', '--outcome', 'Works', '--entities', 'verifyPassword');
  const { store, view } = await openState(workspace);
  try {
    const first = await buildIndex(view.state, embedder, null);
    assert.equal(first.report.embedded, first.report.total);
    assert.ok(first.report.total >= 3, 'two functions and one episode at least');
    assert.ok([...view.state.values()].filter((row) => embeddableText(row) !== null).every((row) => row.kind !== 'file' && row.kind !== 'dir'));
    assert.match(first.index.keys[0], /agent:episode:/, 'episodes are embedded first');
    const second = await buildIndex(view.state, embedder, first.index);
    assert.deepEqual({ embedded: second.report.embedded, reused: second.report.reused }, { embedded: 0, reused: first.report.total });
    const smaller = new Map([...view.state].filter(([, row]) => row.kind !== 'episode'));
    const third = await buildIndex(smaller, embedder, first.index);
    assert.equal(third.report.removed, 1);
    const other = await buildIndex(view.state, { ...embedder, id: 'other@model' }, first.index);
    assert.equal(other.report.reused, 0, 'vectors from another model are never reused');
  } finally { store.close?.(); }
});

withFixture('a limited run reports what remains and a later run completes it', async (workspace) => {
  const { store, view } = await openState(workspace);
  try {
    let clock = 0;
    const partial = await buildIndex(view.state, embedder, null, { batch: 1, deadlineMs: 3, now: () => clock++ * 2 });
    assert.ok(partial.report.remaining > 0 && partial.report.embedded >= 1);
    const done = await buildIndex(view.state, embedder, partial.index);
    assert.equal(done.report.remaining, 0);
    assert.equal(done.report.reused, partial.report.embedded);
  } finally { store.close?.(); }
});

test('index files round-trip and damaged files are rejected', () => {
  const index = { model: 'm', dimension: 2, keys: ['a', 'b'], hashes: ['a'.repeat(32), 'b'.repeat(32)], data: new Float32Array([1, 0, 0, 1]) };
  const { header, data } = encodeIndex(index);
  assert.deepEqual(decodeIndex(JSON.parse(header), data), index);
  assert.equal(decodeIndex(JSON.parse(header), data.slice(0, 8)), null, 'wrong byte length');
  assert.equal(decodeIndex({ ...JSON.parse(header), schemaVersion: 1 }, data), null);
  assert.equal(decodeIndex(JSON.parse(header), new Uint8Array(new Float32Array([1, NaN, 0, 1]).buffer)), null, 'non-finite values');
  assert.deepEqual(nearest(index, new Float32Array([0.9, 0.1]), 1).map((hit) => hit.key), ['a']);
  assert.deepEqual(nearest(index, new Float32Array([1]), 1), [], 'a query of the wrong size matches nothing');
});

// Recompute the public checksum to test structural/numeric rejection independently of corruption detection.
function rebound(header, data) {
  const { schemaVersion, model, dimension, keys, hashes } = header;
  return { ...header, digest: createHash('sha256')
    .update(JSON.stringify([schemaVersion, model, dimension, keys, hashes])).update(data).digest('hex') };
}
const tinyIndex = () => ({ model: 'm', dimension: 2, keys: ['a', 'b'],
  hashes: ['a'.repeat(32), 'b'.repeat(32)], data: new Float32Array([1, 0, 0, 1]) });

test('cache generation binds exact finite bytes and ordered ranking metadata', () => {
  const first = encodeIndex(tinyIndex());
  const header = JSON.parse(first.header);
  assert.equal(header.schemaVersion, 2, 'old unbound format requires explicit rebuild');
  assert.equal(header.digest, rebound(header, first.data).digest, 'independent SHA-256 coverage');
  const mutable = tinyIndex();
  const snapshot = encodeIndex(mutable);
  mutable.data.fill(0); mutable.keys.reverse(); mutable.hashes.reverse();
  assert.deepEqual(decodeIndex(JSON.parse(snapshot.header), snapshot.data), tinyIndex(), 'publication bytes own their snapshot');
  const second = encodeIndex({ ...tinyIndex(), data: new Float32Array([0, 1, 1, 0]) });
  assert.equal(first.data.length, second.data.length);
  assert.equal(decodeIndex(header, second.data), null, 'equal-size mixed generations');
  const changed = first.data.slice();
  new DataView(changed.buffer).setFloat32(0, 0.5, true);
  assert.equal(decodeIndex(header, changed), null, 'finite byte mutation');
  for (const patch of [
    { keys: [...header.keys].reverse(), hashes: [...header.hashes].reverse() },
    { keys: [...header.keys].reverse() }, { hashes: [...header.hashes].reverse() },
    { model: 'other' }, { dimension: 1 }, { digest: '0'.repeat(64) }, { digest: undefined },
    { schemaVersion: 1 }
  ]) assert.equal(decodeIndex({ ...header, ...patch }, first.data), null, JSON.stringify(patch));
});

test('cache validation rejects coherent duplicates, unsafe dimensions, bad hashes and nonunit data', () => {
  const encoded = encodeIndex(tinyIndex());
  const header = JSON.parse(encoded.header);
  for (const patch of [
    { keys: ['a', 'a'] }, { keys: ['', 'b'] }, { hashes: ['bad', 'b'.repeat(32)] },
    { hashes: [] }, { dimension: Number.MAX_SAFE_INTEGER + 1 }, { dimension: 0 },
    { dimension: 1.5 }, { model: '' }
  ]) assert.equal(decodeIndex(rebound({ ...header, ...patch }, encoded.data), encoded.data), null, JSON.stringify(patch));
  for (const values of [[0, 0, 0, 1], [2, 0, 0, 1], [1.0001, 0, 0, 1], [NaN, 0, 0, 1], [Infinity, 0, 0, 1]]) {
    const data = new Uint8Array(new Float32Array(values).buffer);
    assert.equal(decodeIndex(rebound(header, data), data), null, String(values));
    assert.throws(() => encodeIndex({ ...tinyIndex(), data: new Float32Array(values) }));
  }
  assert.throws(() => encodeIndex({ ...tinyIndex(), keys: ['a', 'a'] }));
});

test('cosine is bounded and scale-invariant for queries; invalid vectors never rank', () => {
  const index = tinyIndex();
  const first = nearest(index, new Float32Array([3, 4]), 2);
  const scaled = nearest(index, new Float32Array([300, 400]), 2);
  assert.deepEqual(first, scaled);
  assert.ok(Math.abs(first[0].similarity - 0.8) < 1e-7);
  for (const query of [[0, 0], [NaN, 1], [Infinity, 1], [1]])
    assert.deepEqual(nearest(index, new Float32Array(query), 2), []);
  for (const limit of [0, -1, NaN, Infinity, 1.5]) assert.deepEqual(nearest(index, new Float32Array([1, 0]), limit), []);
  for (const values of [[100, 0, 0, 1], [0, 0, 0, 1], [NaN, 0, 0, 1]])
    assert.deepEqual(nearest({ ...index, data: new Float32Array(values) }, new Float32Array([1, 0]), 2), []);
  const rounded = { ...index, data: new Float32Array([1.000001, 0, 0, -1]) };
  assert.ok(nearest(rounded, new Float32Array([1, 0]), 2).every(({ similarity }) => Number.isFinite(similarity) && Math.abs(similarity) <= 1));
});

test('builder normalizes finite model output, omits zero output explicitly and refuses invalid reuse', async () => {
  const state = new Map(['a', 'b'].map((key) => [key, { kind: 'function', props: JSON.stringify({ name: key }) }]));
  const model = { id: 'm', dimension: 2, embed: async () => [new Float32Array([3, 4]), new Float32Array([0, 0])] };
  const result = await buildIndex(state, model, null);
  assert.deepEqual(result.index.keys, ['a']);
  assert.ok(Math.abs(Math.hypot(...result.index.data) - 1) < 1e-6);
  assert.deepEqual(result.report, { total: 2, embedded: 1, reused: 0, remaining: 0, removed: 0, skippedZero: 1 });
  for (const vector of [[NaN, 0], [Infinity, 0], [1]]) {
    await assert.rejects(buildIndex(state, { ...model, embed: async () => [new Float32Array(vector), new Float32Array([1, 0])] }, null));
  }
  for (const dimension of [0, 1.5, Number.MAX_SAFE_INTEGER + 1])
    await assert.rejects(buildIndex(state, { ...model, dimension }, null));
  const previous = { ...result.index, data: new Float32Array([100, 0]) };
  assert.equal((await buildIndex(state, model, previous)).report.reused, 0);
  const duplicate = { ...result.index, keys: ['a', 'a'], hashes: [result.index.hashes[0], result.index.hashes[0]], data: new Float32Array([1, 0, 0, 1]) };
  assert.equal((await buildIndex(state, model, duplicate)).report.reused, 0);
});

withFixture('vectors add candidates that keywords miss, and only while the element text is unchanged', async (workspace) => {
  const { store, view } = await openState(workspace);
  try {
    const stale = async () => false;
    const query = 'authenticate credentials';
    const plain = await context(store, query, 4000, stale);
    assert.ok(!plain.items.some((item) => item.elementId.endsWith('#verifyPassword')), 'no shared word, so keywords find nothing');
    const { index } = await buildIndex(view.state, embedder, null);
    const vectors = { index, embedQuery: async (text) => (await embedder.embed([text]))[0] };
    const withVectors = await context(store, query, 4000, stale, undefined, { vectors });
    const hit = withVectors.items.find((item) => item.elementId.endsWith('#verifyPassword'));
    assert.equal(hit?.reason.seed, 'meaning');
    assert.ok(!withVectors.items.some((item) => item.elementId.endsWith('#unrelatedThing') && item.reason.seed === 'meaning'));
    const forged = { ...index, hashes: index.hashes.map(() => '0'.repeat(32)) };
    const ignored = await context(store, query, 4000, stale, undefined, { vectors: { index: forged, embedQuery: vectors.embedQuery } });
    assert.ok(!ignored.items.some((item) => item.reason.seed === 'meaning'), 'vectors whose text hash no longer matches are ignored');
    const entityQuery = await context(store, query, 4000, stale, hit.elementId, { vectors });
    assert.ok(entityQuery.items.every((item) => item.reason.seed === undefined), 'entity queries do not use vectors');
    assert.ok(minSimilarity > 0 && minSimilarity < 1);
  } finally { store.close?.(); }
});

withFixture('a failed query embedding leaves the keyword answer unchanged', async (workspace) => {
  const { store, view } = await openState(workspace);
  try {
    const stale = async () => false;
    const { index } = await buildIndex(view.state, embedder, null);
    const base = await context(store, 'verifyPassword', 4000, stale);
    const withBroken = await context(store, 'verifyPassword', 4000, stale, undefined, { vectors: { index, embedQuery: async () => null } });
    assert.deepEqual(withBroken.items.map((item) => item.elementId), base.items.map((item) => item.elementId));
    const results = (packet) => packet.items.map(({ elementId, reason }) => [elementId, reason.score]);
    for (const query of [new Float32Array(dimension), new Float32Array([1]), new Float32Array(dimension).fill(NaN), new Float32Array(dimension).fill(Infinity)]) {
      const invalid = await context(store, 'verifyPassword', 4000, stale, undefined, { vectors: { index, embedQuery: async () => query } });
      assert.deepEqual(results(invalid), results(base), 'invalid query adds no semantic contribution');
    }
    const query = (await embedder.embed(['authenticate credentials']))[0];
    const scores = async (query) => results(await context(store, 'authenticate credentials', 4000, stale, undefined,
      { vectors: { index, embedQuery: async () => query } }));
    assert.deepEqual(await scores(query.map((value) => value * 1000)), await scores(query), 'query scale cannot inflate context scores');
    const rejected = await context(store, 'authenticate credentials', 4000, stale, undefined,
      { vectors: { index: { ...index, data: index.data.map((value) => value * 1000) }, embedQuery: async () => query } });
    assert.deepEqual(rejected.items, [], 'scaled stored data cannot create semantic candidates');
  } finally { store.close?.(); }
});

withFixture('unavailable embeddings budget the public warning and report the full envelope estimate', async (workspace) => {
  const { store, view } = await openState(workspace);
  let index;
  try { ({ index } = await buildIndex(view.state, embedder, null)); }
  finally { store.close?.(); }
  const { header, data } = encodeIndex(index);
  await mkdir(path.join(workspace, '.osg/cache'), { recursive: true });
  await writeFile(path.join(workspace, '.osg/cache/vectors.json'), header);
  await writeFile(path.join(workspace, '.osg/cache/vectors.bin'), data);
  const loader = moduleHooks(`const hooks = { load(url, context, nextLoad) {
      if (url.endsWith('/cli/src/embedder.js')) return { format: 'module', shortCircuit: true,
        source: 'export async function loadEmbedder() { throw new Error("Synthetic unavailable model"); }' };
      return nextLoad(url, context);
    } };`);
  const query = (maxTokens) => {
    const result = spawnSync(process.execPath, ['--import', loader,
      cli, 'context', '--task', 'verifyPassword unrelatedThing', '--max-tokens', String(maxTokens),
      '--workspace', workspace, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const full = query(4000);
  assert.ok(full.data.items.length >= 2, 'lexical matches must fill the constrained budget');
  // Place two lexical matches exactly at the raw-warning boundary, below the 800-token ceiling.
  const boundary = structuredClone(full);
  boundary.data.items = boundary.data.items.slice(0, 2);
  boundary.data.maxTokens = 800;
  boundary.data.estimatedTokens = 800;
  boundary.warnings = boundary.warnings.map(({ code }) => ({ code, message: '' }));
  const maxTokens = Math.ceil(JSON.stringify(boundary).length / 4);
  assert.ok(maxTokens >= 100 && maxTokens <= 800);
  const answer = query(maxTokens);
  assert.deepEqual(answer.warnings, [{ code: 'VECTORS_UNAVAILABLE',
    message: 'The embedding index exists but its model could not be loaded; keyword search was used. Run osg embed.' }]);
  assert.ok(answer.data.items.length > 0, 'keyword fallback still returns evidence');
  const estimatedTokens = Math.ceil(JSON.stringify(answer).length / 4);
  assert.ok(estimatedTokens <= maxTokens, `full envelope uses ${estimatedTokens} tokens, budget is ${maxTokens}`);
  assert.equal(answer.data.maxTokens, maxTokens);
  assert.equal(answer.data.estimatedTokens, estimatedTokens);
});

// All schedules are deterministic: stop between the binary and header publications, or interleave two writers.
withFixture('publication schedules use a validated generation or pure lexical fallback, never mixed vectors', async (workspace) => {
  const { store, view } = await openState(workspace);
  let first;
  const rows = await store.rows();
  const head = await store.head('main');
  try { first = encodeIndex((await buildIndex(view.state, embedder, null)).index); }
  finally { store.close?.(); }
  const original = decodeIndex(JSON.parse(first.header), first.data);
  const second = encodeIndex({ ...original, data: original.data.map((value) => -value) });
  const directory = path.join(workspace, '.osg/cache');
  const headerPath = path.join(directory, 'vectors.json');
  const dataPath = path.join(directory, 'vectors.bin');
  const lexical = ok(workspace, 'context', '--task', 'verifyPassword', '--max-tokens', '800').data.items;
  const snapshotFiles = async () => {
    const result = {};
    for (const name of await readdir(directory)) {
      const file = path.join(directory, name);
      const info = await stat(file);
      if (info.isFile()) result[name] = { bytes: (await readFile(file)).toString('hex'), mtime: info.mtimeMs };
    }
    return result;
  };
  const schedules = [
    [null, first.data], // first writer stopped before header
    [first.header, second.data], // old header / new binary
    [second.header, first.data], // two publishers interleave in reverse
    [first.header, first.data.slice(0, 4)],
    [JSON.stringify({ ...JSON.parse(first.header), keys: [...original.keys].reverse() }), first.data],
    [JSON.stringify({ ...JSON.parse(first.header), schemaVersion: 1 }), first.data],
    [first.header, first.data], [second.header, second.data]
  ];
  for (const [header, data] of schedules) {
    if (header === null) await rm(headerPath, { force: true }); else await writeFile(headerPath, header);
    await writeFile(dataPath, data);
    const before = await snapshotFiles();
    const answer = ok(workspace, 'context', '--task', 'verifyPassword', '--max-tokens', '800');
    assert.deepEqual(answer.data.items.map(({ reason, ...item }) => item), lexical.map(({ reason, ...item }) => item));
    assert.ok(answer.warnings.some(({ code }) => code === (header && decodeIndex(JSON.parse(header), data) ? 'VECTORS_UNAVAILABLE' : 'VECTORS_INVALID')));
    assert.equal(answer.graphCommitId, head);
    assert.ok(Math.ceil(JSON.stringify(answer).length / 4) <= 800);
    assert.deepEqual(await snapshotFiles(), before, 'reads never repair, migrate or rewrite cache');
  }
  const checked = await openState(workspace);
  try { assert.equal(await checked.store.head('main'), head); assert.deepEqual(await checked.store.rows(), rows); }
  finally { checked.store.close?.(); }
});

withFixture('explicit embed rebuilds old derived format and interrupted/interleaved publication fails closed', async (workspace) => {
  const { store } = await openState(workspace);
  const rows = await store.rows();
  const head = await store.head('main');
  store.close?.();
  const directory = path.join(workspace, '.osg/cache');
  const headerPath = path.join(directory, 'vectors.json');
  const dataPath = path.join(directory, 'vectors.bin');
  const old = JSON.stringify({ schemaVersion: 1, model: 'm', dimension: 2, keys: [], hashes: [] });
  const secondLoader = moduleHooks(`const hooks = { load(url, context, next) {
      if (url.endsWith('/cli/src/embedder.js')) return { format: 'module', shortCircuit: true,
        source: 'export async function loadEmbedder() { return { id: "second", dimension: 2, embed: async texts => texts.map(() => new Float32Array([0,1])), close: async () => {} }; }' };
      return next(url, context);
    } };`);
  const loader = (mode) => moduleHooks(`
    const wrapper = 'data:text/javascript,' + encodeURIComponent(\`
      export * from 'node:fs/promises';
      import * as fs from 'node:fs/promises';
      import { spawnSync } from 'node:child_process';
      export async function rename(from, to) {
        if (to.endsWith('vectors.json') && ${JSON.stringify(mode)} === 'interrupt') throw new Error('Injected header interruption');
        if (to.endsWith('vectors.json') && ${JSON.stringify(mode)} === 'interleave') {
          const second = spawnSync(process.execPath, ['--import', ${JSON.stringify(secondLoader)},
            ...process.argv.slice(1)], { encoding: 'utf8', timeout: 30000 });
          if (second.status !== 0) throw new Error('Second publisher failed: ' + second.stderr);
        }
        return fs.rename(from, to);
      }\`);
    const hooks = { resolve(specifier, context, next) {
      if (specifier === 'node:fs/promises' && context.parentURL?.endsWith('/cli/src/index.js')) return { url: wrapper, shortCircuit: true };
      return next(specifier, context);
    }, load(url, context, next) {
      if (url.endsWith('/cli/src/embedder.js')) return { format: 'module', shortCircuit: true,
        source: 'export async function loadEmbedder() { return { id: "m", dimension: 2, embed: async texts => texts.map(() => new Float32Array([1,0])), close: async () => {} }; }' };
      return next(url, context);
    } };`);
  for (const mode of ['interrupt', 'interleave', 'complete']) {
    await writeFile(headerPath, old);
    await writeFile(dataPath, new Uint8Array());
    const result = spawnSync(process.execPath, ['--import', loader(mode),
      cli, 'embed', '--workspace', workspace, '--json'], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, mode === 'interrupt' ? 1 : 0, result.stderr);
    const header = JSON.parse(await readFile(headerPath, 'utf8'));
    const decoded = decodeIndex(header, await readFile(dataPath));
    if (mode === 'complete') { assert.ok(decoded); assert.equal(header.schemaVersion, 2); }
    else {
      assert.equal(decoded, null, mode);
      const answer = ok(workspace, 'context', '--task', 'verifyPassword', '--max-tokens', '800');
      assert.ok(answer.data.items.some((item) => item.elementId.endsWith('#verifyPassword')));
      assert.deepEqual(answer.warnings.map(({ code }) => code), ['VECTORS_INVALID']);
    }
    assert.ok(!(await readdir(directory)).some((name) => name.endsWith('.tmp')), 'writer cleans its staging entries');
  }
  const checked = await openState(workspace);
  try { assert.equal(await checked.store.head('main'), head); assert.deepEqual(await checked.store.rows(), rows); }
  finally { checked.store.close?.(); }
});

withFixture('without the optional package or model, embed explains and context falls back to keywords', async (workspace) => {
  const installed = await import('@huggingface/transformers').then(() => true, () => false);
  if (!installed) {
    const result = run(workspace, 'embed');
    assert.equal(result.status, 9);
    assert.equal(result.json.error.code, 'UNSUPPORTED_OPERATION');
    assert.match(result.json.error.message, /optional package @huggingface\/transformers/);
  }
  const { store, view } = await openState(workspace);
  const { index } = await buildIndex(view.state, embedder, null);
  store.close?.();
  const { header, data } = encodeIndex(index);
  await mkdir(path.join(workspace, '.osg/cache'), { recursive: true });
  await writeFile(path.join(workspace, '.osg/cache/vectors.json'), header);
  await writeFile(path.join(workspace, '.osg/cache/vectors.bin'), data);
  const answer = ok(workspace, 'context', '--task', 'verifyPassword');
  assert.ok(answer.data.items.some((item) => item.elementId.endsWith('#verifyPassword')));
  assert.deepEqual(answer.warnings.map((warning) => warning.code), ['VECTORS_UNAVAILABLE']);
  const diagnosis = ok(workspace, 'doctor').data.checks.find((check) => check.name === 'embeddings');
  assert.equal(diagnosis.ok, true);
  assert.match(diagnosis.detail, /have current vectors/);
});
