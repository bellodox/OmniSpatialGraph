import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildIndex, decodeIndex, embeddableText, encodeIndex, nearest, context, headView, minSimilarity } from '../dist/core/src/index.js';
import { openStore } from '../dist/storage-lance/src/index.js';

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
  const index = { model: 'm', dimension: 2, keys: ['a', 'b'], hashes: ['x', 'y'], data: new Float32Array([1, 0, 0, 1]) };
  const { header, data } = encodeIndex(index);
  assert.deepEqual(decodeIndex(JSON.parse(header), data), index);
  assert.equal(decodeIndex(JSON.parse(header), data.slice(0, 8)), null, 'wrong byte length');
  assert.equal(decodeIndex({ ...JSON.parse(header), schemaVersion: 2 }, data), null);
  assert.equal(decodeIndex(JSON.parse(header), new Uint8Array(new Float32Array([1, NaN, 0, 1]).buffer)), null, 'non-finite values');
  assert.deepEqual(nearest(index, new Float32Array([0.9, 0.1]), 1).map((hit) => hit.key), ['a']);
  assert.deepEqual(nearest(index, new Float32Array([1]), 1), [], 'a query of the wrong size matches nothing');
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
  const loader = `import { registerHooks } from 'node:module';
    registerHooks({ load(url, context, nextLoad) {
      if (url.endsWith('/cli/src/embedder.js')) return { format: 'module', shortCircuit: true,
        source: 'export async function loadEmbedder() { throw new Error("Synthetic unavailable model"); }' };
      return nextLoad(url, context);
    } });`;
  const query = (maxTokens) => {
    const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(loader)}`,
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
