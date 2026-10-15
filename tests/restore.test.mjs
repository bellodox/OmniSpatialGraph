import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const cli = path.resolve('dist/cli/src/index.js');
const run = (workspace, ...args) => {
  const result = spawnSync(process.execPath, [cli, ...args, '--workspace', workspace, '--json'], { encoding: 'utf8' });
  return { status: result.status, json: JSON.parse(result.stdout) };
};
const ok = (workspace, ...args) => { const result = run(workspace, ...args); assert.equal(result.status, 0, JSON.stringify(result.json.error)); return result.json; };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const target = 'code:symbol:src/a.ts#alpha';

async function fixture() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'osg-restore-'));
  await mkdir(path.join(workspace, 'src'), { recursive: true });
  await writeFile(path.join(workspace, 'src/a.ts'), 'export function alpha() { return 1; }\n');
  ok(workspace, 'init');
  ok(workspace, 'sync');
  return workspace;
}
const withFixture = (name, body) => test(name, async () => {
  const workspace = await fixture();
  try { await body(workspace); } finally { await rm(workspace, { recursive: true, force: true }); }
});
const episodes = (workspace) => ok(workspace, 'stats').data.episodes;
const names = async (workspace) => (await readdir(path.join(workspace, '.osg/backup'))).sort();

withFixture('restore lists backups without writing, then returns the store to a chosen backup and can be undone', async (workspace) => {
  ok(workspace, 'remember', '--task', 'One', '--decision', 'first', '--outcome', 'done', '--entities', target);
  const backup = ok(workspace, 'backup').data.path.split('/').pop();
  await pause(10);
  ok(workspace, 'remember', '--task', 'Two', '--decision', 'second', '--outcome', 'done', '--entities', target);
  await writeFile(path.join(workspace, 'src/a.ts'), 'export function alpha() { return 1; }\nexport function beta() { return 2; }\n');
  ok(workspace, 'sync');
  assert.equal(episodes(workspace), 2);

  const before = await names(workspace);
  const listed = ok(workspace, 'restore').data.backups;
  assert.deepEqual(await names(workspace), before, 'listing writes nothing');
  assert.equal(listed.length, 1);
  assert.deepEqual([listed[0].name, listed[0].format, listed[0].commits, listed[0].verified], [backup, 2, 2, true]);

  const restored = ok(workspace, 'restore', '--backup', backup).data;
  assert.equal(restored.commits, 2);
  assert.equal(restored.previousStoreVerified, true);
  assert.equal(episodes(workspace), 1);
  assert.equal(ok(workspace, 'verify').data.commits, 2);
  assert.equal((await readFile(path.join(workspace, '.osg/export/episodes.jsonl'), 'utf8')).trim().split('\n').length, 1, 'export follows the restored graph');
  assert.equal(ok(workspace, 'context', '--entity', 'code:symbol:src/a.ts#beta').data.items.length, 0, 'later symbols are gone');
  assert.equal(JSON.parse(await readFile(path.join(workspace, '.osg/config.json'), 'utf8')).format, 2);

  // The state before the restore was kept and can be restored in turn.
  const undo = (await names(workspace)).find((name) => name.endsWith('-pre-restore'));
  assert.ok(undo);
  ok(workspace, 'restore', '--backup', undo);
  assert.equal(episodes(workspace), 2);
  assert.equal(ok(workspace, 'verify').data.commits, 4);
});

withFixture('restore works when the current store is unreadable and says the safety copy is unverified', async (workspace) => {
  const backup = ok(workspace, 'backup').data.path.split('/').pop();
  await rm(path.join(workspace, '.osg/store/graph.lance/_versions'), { recursive: true, force: true });
  assert.notEqual(run(workspace, 'verify').status, 0);
  const restored = ok(workspace, 'restore', '--backup', backup).data;
  assert.equal(restored.previousStoreVerified, false);
  assert.equal(ok(workspace, 'verify').data.commits, 1);
});

withFixture('restore refuses unknown names, path tricks, damaged backups and newer formats, changing nothing', async (workspace) => {
  const backup = ok(workspace, 'backup').data.path.split('/').pop();
  for (const name of ['nope', '../backup', '2026-01-01T00-00-00-000Z']) {
    const refused = run(workspace, 'restore', '--backup', name);
    assert.equal(refused.status, 7);
    assert.equal(refused.json.error.code, 'BACKUP_NOT_FOUND');
  }
  // A damaged copy fails verification before anything is touched.
  const damaged = '2026-01-02T00-00-00-000Z';
  await cp(path.join(workspace, '.osg/backup', backup), path.join(workspace, '.osg/backup', damaged), { recursive: true });
  await rm(path.join(workspace, '.osg/backup', damaged, 'store/graph.lance/_versions'), { recursive: true, force: true });
  const failed = run(workspace, 'restore', '--backup', damaged);
  assert.equal(failed.status, 8);
  assert.equal(failed.json.error.code, 'VERIFY_FAILED');
  // A backup from a newer format is refused.
  const newer = '2026-01-03T00-00-00-000Z';
  await cp(path.join(workspace, '.osg/backup', backup), path.join(workspace, '.osg/backup', newer), { recursive: true });
  const metaFile = path.join(workspace, '.osg/backup', newer, 'meta.json');
  await writeFile(metaFile, JSON.stringify({ ...JSON.parse(await readFile(metaFile, 'utf8')), format: 99 }));
  assert.equal(run(workspace, 'restore', '--backup', newer).json.error.code, 'UNSUPPORTED_FORMAT');
  assert.ok(!(await names(workspace)).some((name) => name.endsWith('-pre-restore')), 'no safety copy for refused restores');
  assert.equal(ok(workspace, 'verify').data.commits, 1);
});

withFixture('a backup without meta.json is restored as format 1 and migrate follows', async (workspace) => {
  const backup = ok(workspace, 'backup').data.path.split('/').pop();
  await rm(path.join(workspace, '.osg/backup', backup, 'meta.json'));
  const listed = ok(workspace, 'restore').data.backups[0];
  assert.deepEqual([listed.name, listed.format, listed.commits], [backup, null, null]);
  const restored = ok(workspace, 'restore', '--backup', backup).data;
  assert.deepEqual([restored.format, restored.migrationRequired], [1, true]);
  assert.equal(run(workspace, 'sync').json.error.code, 'MIGRATION_REQUIRED');
  ok(workspace, 'migrate');
  assert.equal(run(workspace, 'sync').status, 0);
});

withFixture('restore and its pre-restore copies are not pruned like ordinary backups', async (workspace) => {
  const first = ok(workspace, 'backup').data.path.split('/').pop();
  ok(workspace, 'restore', '--backup', first);
  for (let i = 0; i < 7; i++) { await pause(5); ok(workspace, 'backup'); }
  const all = await names(workspace);
  assert.equal(all.filter((name) => name.endsWith('-pre-restore')).length, 1);
  assert.equal(all.filter((name) => !name.includes('-pre-')).length, 5);
});
