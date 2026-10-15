import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const cli = path.resolve('dist/cli/src/index.js');
const entity = 'code:symbol:src/auth/login.ts#verifyPassword';
const run = (workspace, ...args) => {
  const result = spawnSync(process.execPath, [cli, ...args, '--workspace', workspace, '--json'], { encoding: 'utf8' });
  return { status: result.status, json: JSON.parse(result.stdout) };
};
const publicCli = path.resolve('dist/cli/src/public.js');
const runAsync = (workspace, ...args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [publicCli, ...args, '--workspace', workspace, '--json'], {
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, killSignal: 'SIGKILL'
  });
  let stdout = '';
  let stderr = '';
  let spawnError;
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  child.on('error', (error) => { spawnError = error; });
  child.on('close', (status, signal) => {
    try {
      assert.ifError(spawnError);
      assert.equal(signal, null, `${args[0]} terminated: ${stderr}`);
      resolve({ status, json: JSON.parse(stdout) });
    } catch (cause) {
      reject(new Error(`${args[0]} failed (status ${status}, signal ${signal}); stdout: ${stdout}; stderr: ${stderr}`, { cause }));
    }
  });
});
async function fixture() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'osg-memory-'));
  await mkdir(path.join(workspace, 'src/auth'), { recursive: true });
  await mkdir(path.join(workspace, 'src/billing'), { recursive: true });
  await writeFile(path.join(workspace, 'src/auth/login.ts'), 'export function verifyPassword(u: string, p: string) { return p.length > 0; }\n');
  await writeFile(path.join(workspace, 'src/billing/invoice.ts'), 'export function totalInvoice(a: number[]) { return a.length; }\n');
  await writeFile(path.join(workspace, 'src/billing/tax.ts'), 'export function addTax(n: number) { return n; }\n');
  assert.equal(run(workspace, 'init').status, 0);
  assert.equal(run(workspace, 'sync').status, 0);
  return workspace;
}
const episodes = (result) => result.json.data.items.filter((item) => item.kind === 'episode');

test('entity context at the default budget returns the entity first and its episode before unrelated code', async () => {
  const workspace = await fixture();
  try {
    assert.equal(run(workspace, 'remember', '--task', 'Harden login', '--decision', 'Use argon2id', '--outcome', 'planned', '--entities', entity).status, 0);
    const result = run(workspace, 'context', '--entity', entity);
    assert.equal(result.status, 0);
    const items = result.json.data.items;
    assert.equal(items[0].elementId, entity);
    assert.equal(items[1].kind, 'episode');
    assert.equal(items[1].data.untrusted, true);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test('episodes are newest first and carry an observation time', async () => {
  const workspace = await fixture();
  try {
    for (let i = 0; i < 4; i++) {
      assert.equal(run(workspace, 'remember', '--task', 'Hashing choice', '--decision', `option ${i}`, '--outcome', 'n', '--entities', entity).status, 0);
      await new Promise((done) => setTimeout(done, 5));
    }
    const found = episodes(run(workspace, 'context', '--task', 'Hashing choice', '--max-tokens', '4000'));
    assert.deepEqual(found.map((item) => item.data.value.decision), ['option 3', 'option 2', 'option 1', 'option 0']);
    assert.ok(found.every((item) => !Number.isNaN(Date.parse(item.provenance.observedAt))));
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test('a superseding episode retires the earlier one, which is labelled and listed last', async () => {
  const workspace = await fixture();
  try {
    const first = run(workspace, 'remember', '--task', 'Hashing', '--decision', 'use argon2id', '--outcome', 'planned', '--entities', entity);
    const oldId = first.json.data.episodeId;
    await new Promise((done) => setTimeout(done, 5));
    const second = run(workspace, 'remember', '--task', 'Hashing', '--decision', 'use scrypt instead', '--outcome', 'done', '--entities', entity, '--supersedes', `${oldId},agent:episode:missing`);
    assert.equal(second.status, 0);
    assert.ok(second.json.warnings.some((warning) => warning.code === 'UNRESOLVED_SUPERSEDES'));
    const found = episodes(run(workspace, 'context', '--entity', entity, '--max-tokens', '4000'));
    assert.equal(found[0].data.value.decision, 'use scrypt instead');
    assert.equal(found[0].provenance.supersededBy, undefined);
    assert.equal(found[1].elementId, oldId);
    assert.equal(found[1].provenance.supersededBy, second.json.data.episodeId);
    assert.equal(run(workspace, 'verify').status, 0);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test('six concurrent remember processes respect bounded conflicts and recover with one caller sync and retry', { timeout: 120000 }, async (t) => {
  const workspace = await fixture();
  try {
    const originalHistory = await runAsync(workspace, 'history', '--entity', entity);
    assert.equal(originalHistory.status, 0);
    const commands = [...Array(6).keys()].map((i) =>
      ['remember', '--task', `concurrent ${i}`, '--decision', `c${i}`, '--outcome', 'o', '--entities', entity]);
    const settled = await Promise.allSettled(commands.map((args) => runAsync(workspace, ...args)));
    const results = settled.map((result) => {
      assert.equal(result.status, 'fulfilled', result.reason?.stack);
      return result.value;
    });
    t.diagnostic(`first-wave exits: ${results.map((result) => result.status).join(',')}`);
    for (const [index, result] of results.entries()) {
      if (result.status !== 0) t.diagnostic(`writer ${index} failure: ${JSON.stringify(result)}`);
    }
    assert.ok(results.some((result) => result.status === 0), 'at least one concurrent writer succeeds');
    const successfulIds = [];
    for (const result of results) {
      assert.ok([0, 3].includes(result.status), JSON.stringify(result));
      assert.equal(result.json.ok, result.status === 0);
      if (result.status === 3) {
        assert.equal(result.json.data, null);
        assert.equal(result.json.error.code, 'STALE_HEAD');
        assert.equal(result.json.error.category, 'conflict');
        assert.equal(result.json.error.retryable, true);
      } else {
        assert.equal(result.json.error, null);
        assert.equal(result.json.graphCommitId, result.json.data.commitId);
        assert.match(result.json.data.episodeId, /^agent:episode:[0-9a-f]{24}$/);
        successfulIds.push(result.json.data.episodeId);
      }
    }
    assert.equal(new Set(successfulIds).size, successfulIds.length);
    const firstContext = await runAsync(workspace, 'context', '--task', 'concurrent', '--max-tokens', '4000');
    assert.equal(firstContext.status, 0);
    assert.equal(firstContext.json.ok, true);
    const firstEpisodes = episodes(firstContext);
    assert.deepEqual(firstEpisodes.map((item) => item.elementId).sort(), [...successfulIds].sort());
    assert.deepEqual(firstEpisodes.map((item) => item.data.value.decision).sort(),
      results.flatMap((result, i) => result.status === 0 ? [`c${i}`] : []).sort());
    for (const [index, result] of results.entries()) {
      if (result.status !== 3) continue;
      const synced = await runAsync(workspace, 'sync');
      assert.equal(synced.status, 0, JSON.stringify(synced));
      assert.equal(synced.json.ok, true);
      assert.equal(synced.json.error, null);
      assert.equal(synced.json.data.noop, true, 'recovery preserves unchanged source facts');
      const recovered = await runAsync(workspace, ...commands[index]);
      assert.equal(recovered.status, 0, JSON.stringify(recovered));
      assert.equal(recovered.json.ok, true);
      assert.equal(recovered.json.error, null);
      assert.equal(recovered.json.graphCommitId, recovered.json.data.commitId);
      assert.match(recovered.json.data.episodeId, /^agent:episode:[0-9a-f]{24}$/);
      successfulIds.push(recovered.json.data.episodeId);
    }
    assert.equal(new Set(successfulIds).size, 6);
    const finalContext = await runAsync(workspace, 'context', '--task', 'concurrent', '--max-tokens', '4000');
    assert.equal(finalContext.status, 0);
    assert.equal(finalContext.json.ok, true);
    const found = episodes(finalContext);
    assert.equal(found.length, 6);
    assert.deepEqual(found.map((item) => item.data.value.decision).sort(), ['c0', 'c1', 'c2', 'c3', 'c4', 'c5']);
    assert.deepEqual(found.map((item) => item.elementId).sort(), successfulIds.sort());
    const finalHistory = await runAsync(workspace, 'history', '--entity', entity);
    assert.equal(finalHistory.status, 0);
    assert.deepEqual(finalHistory.json.data.versions, originalHistory.json.data.versions);
    const verified = await runAsync(workspace, 'verify');
    assert.equal(verified.status, 0);
    assert.equal(verified.json.ok, true);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});
