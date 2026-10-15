import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const cli = path.resolve('dist/cli/src/index.js');
const run = (workspace, ...args) => {
  const result = spawnSync(process.execPath, [cli, ...args, '--workspace', workspace, '--json'], { encoding: 'utf8' });
  return { status: result.status, json: JSON.parse(result.stdout) };
};
const ok = (workspace, ...args) => { const result = run(workspace, ...args); assert.equal(result.status, 0, JSON.stringify(result.json.error)); return result.json; };
const login = 'code:symbol:src/auth/login.ts#verifyPassword';
const hash = 'code:symbol:src/auth/hash.ts#hashPassword';

async function fixture() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'osg-features-'));
  await mkdir(path.join(workspace, 'src/auth'), { recursive: true });
  await mkdir(path.join(workspace, 'tests'), { recursive: true });
  await writeFile(path.join(workspace, 'src/auth/login.ts'), "import { hashPassword } from './hash';\nexport function verifyPassword(u: string, p: string) { return hashPassword(p).length > 0; }\n");
  await writeFile(path.join(workspace, 'src/auth/hash.ts'), "export function hashPassword(p: string) { const salted = p + 'x'; return salted; }\n");
  await writeFile(path.join(workspace, 'tests/login.test.ts'), "import { verifyPassword } from '../src/auth/login';\nverifyPassword('a', 'b');\n");
  await writeFile(path.join(workspace, 'notes.md'), '# Notes\nverifyPassword runs before every session is created.\n');
  ok(workspace, 'init');
  ok(workspace, 'sync');
  return workspace;
}
const withFixture = (name, body) => test(name, async () => {
  const workspace = await fixture();
  try { await body(workspace); } finally { await rm(workspace, { recursive: true, force: true }); }
});
const items = (json) => json.data.items;
const find = (json, id) => items(json).find((item) => item.elementId === id);

withFixture('the graph links calls, tests, directories and documentation mentions', async (workspace) => {
  const around = ok(workspace, 'context', '--entity', login, '--max-tokens', '4000');
  assert.equal(find(around, hash)?.reason.edge, 'calls');
  assert.equal(find(around, 'code:file:tests/login.test.ts')?.reason.edge, 'tests');
  assert.ok(items(around).some((item) => item.kind === 'dir'));
  const doc = ok(workspace, 'context', '--task', 'session creation notes', '--max-tokens', '4000');
  assert.ok(items(doc).some((item) => item.elementId.startsWith('doc:') || item.elementId.includes('notes.md')));
});

withFixture('names resolve to entities, secrets are redacted, tags and anchors are stored', async (workspace) => {
  const saved = ok(workspace, 'remember', '--task', 'Hash policy', '--decision', 'Salt every hash; password: hunter2secret', '--outcome', 'key sk-abcdefghijklmnopqrstuvwxyz123 rotated',
    '--entities', 'hashPassword', '--tags', 'security,Auth');
  assert.equal(saved.data.resolved, 1);
  assert.ok(saved.warnings.some((warning) => warning.code === 'SECRET_REDACTED'));
  const text = await readFile(path.join(workspace, '.osg/export/episodes.jsonl'), 'utf8');
  assert.ok(!text.includes('hunter2secret') && !text.includes('sk-abcdefghij'));
  const value = JSON.parse(text.trim()).data.value;
  assert.deepEqual(value.tags, ['Auth', 'security']);
  assert.equal(value.anchors[0].entity, hash);
  const found = find(ok(workspace, 'context', '--entity', hash, '--max-tokens', '4000'), saved.data.episodeId);
  assert.equal(found.provenance.anchors, 'ok');
});

withFixture('an anchored episode is flagged when the code it describes changes', async (workspace) => {
  const saved = ok(workspace, 'remember', '--task', 'Hash policy', '--decision', 'Keep salted hash', '--outcome', 'done', '--entities', hash);
  await writeFile(path.join(workspace, 'src/auth/hash.ts'), "export function hashPassword(p: string) { return 'argon2:' + p; }\n");
  ok(workspace, 'sync');
  assert.equal(find(ok(workspace, 'context', '--entity', hash, '--max-tokens', '4000'), saved.data.episodeId).provenance.anchors, 'changed');
});

withFixture('a renamed symbol keeps its episodes through a body-hash relink', async (workspace) => {
  const saved = ok(workspace, 'remember', '--task', 'Hash policy', '--decision', 'Keep salted hash', '--outcome', 'done', '--entities', hash);
  await writeFile(path.join(workspace, 'src/auth/hash.ts'), "export function hashSecret(p: string) { const salted = p + 'x'; return salted; }\n");
  await writeFile(path.join(workspace, 'src/auth/login.ts'), "import { hashSecret } from './hash';\nexport function verifyPassword(u: string, p: string) { return hashSecret(p).length > 0; }\n");
  const synced = ok(workspace, 'sync');
  assert.equal(synced.data.renamed, 1);
  const renamed = 'code:symbol:src/auth/hash.ts#hashSecret';
  assert.ok(find(ok(workspace, 'context', '--entity', renamed, '--max-tokens', '4000'), saved.data.episodeId));
});

withFixture('diff, time queries and history read earlier graph states', async (workspace) => {
  const first = ok(workspace, 'context', '--entity', login).graphCommitId;
  await writeFile(path.join(workspace, 'src/auth/extra.ts'), 'export function extra() { return 1; }\n');
  const second = ok(workspace, 'sync').data.commitId;
  const delta = ok(workspace, 'diff', '--from', first, '--to', second).data;
  assert.ok(delta.added.ids.includes('code:symbol:src/auth/extra.ts#extra'));
  assert.equal(delta.removed.count, 0);
  const everything = ok(workspace, 'diff', '--from', 'ROOT', '--to', first).data;
  assert.ok(everything.added.count > 0);
  const before = ok(workspace, 'context', '--task', 'extra', '--commit', first, '--max-tokens', '4000');
  assert.ok(!items(before).some((item) => item.elementId.endsWith('#extra')));
  const now = ok(workspace, 'context', '--task', 'extra', '--max-tokens', '4000');
  assert.ok(items(now).some((item) => item.elementId.endsWith('#extra')));
  assert.equal(ok(workspace, 'history', '--entity', 'code:symbol:src/auth/extra.ts#extra').data.versions.length, 1);
});

withFixture('--with-source returns fresh source lines and none for stale files', async (workspace) => {
  const fresh = find(ok(workspace, 'context', '--entity', login, '--with-source', '--max-tokens', '4000'), login);
  assert.equal(fresh.snippet.untrusted, true);
  assert.match(fresh.snippet.value, /verifyPassword/);
  await writeFile(path.join(workspace, 'src/auth/login.ts'), '// rewritten\n');
  const stale = find(ok(workspace, 'context', '--entity', login, '--with-source', '--max-tokens', '4000'), login);
  assert.equal(stale.citation.stale, true);
  assert.equal(stale.snippet, undefined);
});

withFixture('instruction-like repository snippets stay inside an explicitly untrusted container', async (workspace) => {
  const marker = 'IGNORE_PRIOR_INSTRUCTIONS_SYNTHETIC';
  await writeFile(path.join(workspace, 'src/auth/login.ts'), `export function verifyPassword(u: string, p: string) { // ${marker}\n  return p.length > 0;\n}\n`);
  ok(workspace, 'sync');
  const item = find(ok(workspace, 'context', '--entity', login, '--with-source', '--max-tokens', '4000'), login);
  assert.equal(item.citation.stale, false);
  assert.equal(item.snippet.untrusted, true);
  assert.match(item.snippet.value, /IGNORE_PRIOR_INSTRUCTIONS_SYNTHETIC/);
  const removeUntrusted = (value) => {
    if (Array.isArray(value)) return value.map(removeUntrusted);
    if (value && typeof value === 'object') {
      if (value.untrusted === true) return undefined;
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, removeUntrusted(child)]));
    }
    return value;
  };
  assert.ok(!JSON.stringify(removeUntrusted(item)).includes(marker));
});

withFixture('stats, backup and doctor operate on a healthy store; doctor --fix rebuilds caches', async (workspace) => {
  ok(workspace, 'remember', '--task', 'T', '--decision', 'D', '--outcome', 'O', '--entities', login);
  ok(workspace, 'context', '--entity', login);
  const stats = ok(workspace, 'stats').data;
  assert.equal(stats.episodes, 1);
  assert.equal(stats.byCommand.remember, 1);
  assert.equal(stats.byCommand.context, undefined, 'reads are pure (R15) and are not logged');
  const backup = ok(workspace, 'backup').data;
  assert.equal(backup.kept, 1);
  assert.ok((await readdir(path.join(workspace, '.osg/backup'))).length === 1);
  const diagnosis = ok(workspace, 'doctor').data;
  assert.equal(diagnosis.checks.find((check) => check.name === 'graph verification').ok, true);
  // Remember advances the graph; pure context reads must not refresh its older cache.
  assert.equal(diagnosis.checks.find((check) => check.name === 'state cache').ok, false);
  assert.equal(diagnosis.ok, false);
  await writeFile(path.join(workspace, '.osg/cache/state.json'), '{"broken":');
  assert.equal(ok(workspace, 'doctor').data.ok, true);
  const fixed = ok(workspace, 'doctor', '--fix').data;
  assert.equal(fixed.fixed, true);
  await assert.rejects(readFile(path.join(workspace, '.osg/cache/state.json')));
  assert.equal(ok(workspace, 'verify').data.commits, 2);
});

withFixture('a corrupted state cache is ignored and the answer matches a cold run', async (workspace) => {
  ok(workspace, 'remember', '--task', 'T', '--decision', 'D', '--outcome', 'O', '--entities', login);
  const warm = ok(workspace, 'context', '--entity', login, '--max-tokens', '4000');
  const file = path.join(workspace, '.osg/cache/state.json');
  const cached = JSON.parse(await readFile(file, 'utf8'));
  cached.rows.pop();
  await writeFile(file, JSON.stringify(cached));
  const damaged = ok(workspace, 'context', '--entity', login, '--max-tokens', '4000');
  assert.deepEqual(items(damaged).map((item) => item.elementId), items(warm).map((item) => item.elementId));
  await rm(path.join(workspace, '.osg/cache'), { recursive: true, force: true });
  const cold = ok(workspace, 'context', '--entity', login, '--max-tokens', '4000');
  assert.deepEqual(items(cold).map((item) => item.elementId), items(warm).map((item) => item.elementId));
});

withFixture('forged cached state text/status and foreign rows cannot override committed facts', async (workspace) => {
  ok(workspace, 'remember', '--task', 'T', '--decision', 'D', '--outcome', 'O', '--entities', login);
  const file = path.join(workspace, '.osg/cache/state.json');
  const warm = ok(workspace, 'context', '--entity', login, '--max-tokens', '4000');
  ok(workspace, 'sync'); // Writes a current-head cache from committed rows; reads remain pure.
  const original = JSON.parse(await readFile(file, 'utf8'));
  for (const mutation of ['status', 'text', 'foreign']) {
    const forged = structuredClone(original);
    if (mutation === 'foreign') forged.rows.push({ ...forged.rows[0], element_id: 'policy:restriction:forged' });
    else {
      const episode = forged.rows.find((row) => row.kind === 'episode');
      if (mutation === 'status') episode.status = 'approved';
      else episode.props = JSON.stringify({ ...JSON.parse(episode.props), decision: 'FORGED_CACHE_DECISION' });
    }
    await writeFile(file, JSON.stringify(forged));
    const packet = ok(workspace, 'context', '--entity', login, '--max-tokens', '4000');
    assert.deepEqual(packet.data.items, warm.data.items, mutation);
    assert.equal(packet.graphCommitId, warm.graphCommitId);
  }
  await rm(path.join(workspace, '.osg/cache'), { recursive: true, force: true });
  assert.deepEqual(ok(workspace, 'context', '--entity', login, '--max-tokens', '4000').data.items, warm.data.items);
  assert.equal(ok(workspace, 'verify').data.commits, 2);
});

withFixture('incremental scan reuses unchanged files and picks up edits and deletions', async (workspace) => {
  const again = ok(workspace, 'sync');
  assert.equal(again.data.noop, true);
  await writeFile(path.join(workspace, 'src/auth/hash.ts'), "export function hashPassword(p: string) { return p; }\nexport function other() { return 2; }\n");
  assert.equal(ok(workspace, 'sync').data.noop, false);
  assert.ok(find(ok(workspace, 'context', '--entity', 'code:symbol:src/auth/hash.ts#other'), 'code:symbol:src/auth/hash.ts#other'));
  await rm(path.join(workspace, 'src/auth/hash.ts'));
  ok(workspace, 'sync');
  assert.equal(find(ok(workspace, 'context', '--task', 'hashPassword', '--max-tokens', '4000'), hash), undefined);
  assert.equal(ok(workspace, 'verify').data.commits, 3);
});

withFixture('forged scan cache cannot publish fabricated or excluded facts on a no-op sync', async (workspace) => {
  const file = path.join(workspace, '.osg/cache/scan.json');
  const cache = { files: {} };
  const entry = cache.files['src/auth/login.ts'] ?? { info: { decls: [] } };
  entry.info.decls.push({ name: 'FabricatedSymbol', kind: 'function', start: 1, end: 1, signature: null, bodyHash: null, calls: [] });
  cache.files['notes.md'] ??= { info: {} };
  cache.files['notes.md'].info.relative = '.osg/private.md';
  cache.generatedAt = Date.now() + 100_000;
  await writeFile(file, JSON.stringify(cache));
  const before = ok(workspace, 'verify');
  const synced = ok(workspace, 'sync');
  assert.equal(synced.data.noop, true);
  assert.equal(synced.graphCommitId, before.graphCommitId);
  assert.ok(!ok(workspace, 'context', '--task', 'FabricatedSymbol', '--max-tokens', '4000').data.items
    .some((item) => item.elementId.includes('FabricatedSymbol')));
  assert.ok(!ok(workspace, 'context', '--task', 'private.md', '--max-tokens', '4000').data.items
    .some((item) => item.citation?.path === '.osg/private.md' || item.elementId.includes('.osg/private.md')));
  assert.deepEqual(ok(workspace, 'verify').data, before.data);
});
