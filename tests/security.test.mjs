import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, lstat, link, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../dist/storage-lance/src/index.js';
import { commit, snapshot, verify } from '../dist/core/src/graph.js';
import { canon, contentHash, hash } from '../dist/core/src/hash.js';
import { blankRow } from '../dist/contracts/src/index.js';
import { context } from '../dist/core/src/retrieval.js';
import { history, remember } from '../dist/core/src/memory.js';
import { moduleHooks } from './module-hooks.mjs';

const entry = path.resolve('dist/cli/src/index.js');
function cli(root, command, args = [], hook, executable = entry) {
  const result = spawnSync(process.execPath, [...(hook ? ['--import', hook] : []),
    executable, command, ...(command === 'export' ? ['episodes'] : []), '--workspace', root, ...args, '--json'],
  { encoding: 'utf8', timeout: 30000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.stdout.trim().split('\n').length, 1, result.stderr);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.ok, result.status === 0);
  return { exit: result.status, ...envelope };
}

async function sentinelState(file) {
  return { bytes: await readFile(file, 'utf8'), mtime: (await lstat(file)).mtimeMs };
}

// Exit status detects even forbidden reads swallowed by the freshness/source callbacks.
function forbiddenReadHook(root, relatives) {
  return `data:text/javascript,${encodeURIComponent(`import fs from 'node:fs/promises'; import path from 'node:path'; import {syncBuiltinESMExports} from 'node:module';
    const denied=new Set(${JSON.stringify(relatives.map((relative) => path.join(root, relative)))});
    const original=fs.readFile; let forbidden=0;
    fs.readFile=async function(target,...args) { if(denied.has(path.resolve(String(target)))) { forbidden++; throw Error('FORBIDDEN_FIXTURE_READ'); } return original(target,...args); };
    syncBuiltinESMExports(); process.on('exit',()=>{if(forbidden)process.exitCode=99;});`)}`;
}

async function runtimeBytes(root) {
  const directory = path.join(root, '.osg');
  const files = await readdir(directory, { recursive: true, withFileTypes: true });
  const result = {};
  for (const file of files.filter((entry) => entry.isFile())) {
    const target = path.join(file.parentPath, file.name);
    result[path.relative(directory, target)] = { bytes: (await readFile(target)).toString('hex'), mtime: (await lstat(target)).mtimeMs };
  }
  return result;
}

test('current and historical source reads enforce newly ignored ancestors before hashing or snippets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'osg-security-source-ignore-'));
  try {
    const relative = 'nested/closed/source.ts';
    const marker = 'CurrentRawPrivacyMarker';
    await mkdir(path.join(root, 'nested/closed'), { recursive: true });
    await writeFile(path.join(root, relative), `export function visibleSymbol() { return '${marker}'; }\n`);
    await writeFile(path.join(root, 'nested/closed/.gitignore'), '!source.ts\n');
    assert.equal(cli(root, 'init').exit, 0);
    assert.equal(cli(root, 'sync').exit, 0);
    const found = cli(root, 'context', ['--task', 'visibleSymbol', '--max-tokens', '4000']);
    const symbol = found.data.items.find((item) => item.kind === 'function');
    assert.ok(symbol);
    const remembered = cli(root, 'remember', ['--task', 'source privacy', '--decision', 'retain metadata', '--outcome', 'fixture', '--entities', symbol.elementId]);
    assert.equal(remembered.exit, 0);
    const baseArgs = ['--entity', symbol.elementId, '--max-tokens', '4000'];
    const publicEntry = path.resolve('dist/cli/src/public.js');
    const permitted = cli(root, 'context', [...baseArgs, '--with-source'], undefined, publicEntry);
    assert.equal(permitted.exit, 0);
    assert.ok(permitted.data.items.find((item) => item.elementId === symbol.elementId).snippet.value.includes(marker));
    await writeFile(path.join(root, 'nested/.gitignore'), 'closed/\n!closed/source.ts\n');
    const before = await runtimeBytes(root);
    const hook = forbiddenReadHook(root, [relative, 'nested/closed/.gitignore']);
    for (const selector of [[], ['--commit', remembered.graphCommitId]]) {
      const args = [...baseArgs, ...selector];
      const result = cli(root, 'context', [...args, '--with-source'], undefined, publicEntry);
      assert.equal(result.exit, 0);
      const item = result.data.items.find((item) => item.elementId === symbol.elementId);
      assert.ok(item, 'historical metadata remains available');
      assert.equal(item.citation.stale, true);
      assert.equal(item.snippet, undefined);
      assert.ok(!JSON.stringify(result).includes(marker));
      for (const sourceArgs of [[], ['--with-source']]) {
        assert.equal(cli(root, 'context', [...args, ...sourceArgs], hook, publicEntry).exit, 0, 'excluded content must not be read, even for hashing');
      }
    }
    assert.deepEqual(await runtimeBytes(root), before, 'context must not mutate runtime files');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('current and historical source callbacks reject mandatory paths from previously indexed rows', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'osg-security-source-mandatory-'));
  try {
    assert.equal(cli(root, 'init').exit, 0);
    const paths = process.platform === 'win32'
      ? ['pOdS/private.ts', '.OSG/private.ts', 'docs/Tasks/private.ts', '.SpeXcode/private.ts', 'nested/Types.d.TS', 'nested/Credentials.JSON/private.ts']
      : ['Pods/private.ts', '.osg/private.ts', 'docs/tasks/private.ts', '.spexcode/private.ts', 'nested/types.d.ts', 'nested/credentials.json/private.ts'];
    paths.push('nested/.env.fixture.ts');
    const body = "export function priorSymbol() { return 'MandatoryRawPrivacyMarker'; }\n";
    // Use the raw-byte source SHA, not the canonical graph hash.
    const { createHash } = await import('node:crypto');
    const rawHash = createHash('sha256').update(body).digest('hex');
    const proposals = [];
    for (const relative of paths) {
      await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
      await writeFile(path.join(root, relative), body);
      const fileId = `code:file:${relative}`;
      proposals.push({ ...provenanceRecord(`code:symbol:${relative}#priorSymbol`, 'observed', 'function', { name: 'priorSymbol', path: relative }),
        source_hash: rawHash, extent: { frame_id: fileId, t: null, q: null, ext_min: [1], ext_max: [1] } });
    }
    const store = await openStore(path.join(root, '.osg/store'));
    const prior = await commit(store, proposals, 'provider-tsc@0.1.0');
    const before = await runtimeBytes(root);
    const hook = forbiddenReadHook(root, paths);
    for (const proposal of proposals) for (const selector of [[], ['--commit', prior.commitId]]) {
      const args = ['--entity', proposal.element_id, '--max-tokens', '4000', ...selector];
      const result = cli(root, 'context', [...args, '--with-source']);
      assert.equal(result.exit, 0);
      const item = result.data.items.find((item) => item.elementId === proposal.element_id);
      assert.ok(item);
      assert.equal(item.citation.stale, true);
      assert.equal(item.snippet, undefined);
      assert.ok(!JSON.stringify(result).includes('MandatoryRawPrivacyMarker'));
      assert.equal(cli(root, 'context', [...args, '--with-source'], hook).exit, 0);
    }
    assert.deepEqual(await runtimeBytes(root), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('doctor detects forged cache text and status with unchanged row keys without writing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'osg-security-doctor-cache-'));
  try {
    await writeFile(path.join(root, 'source.ts'), 'export function cacheSymbol() { return 1; }\n');
    assert.equal(cli(root, 'init').exit, 0);
    assert.equal(cli(root, 'sync').exit, 0);
    const target = path.join(root, '.osg/cache/state.json');
    const original = JSON.parse(await readFile(target, 'utf8'));
    assert.equal(cli(root, 'doctor').data.checks.find((check) => check.name === 'state cache').ok, true);
    for (const mutation of [{ props: '{"name":"ForgedCacheText"}' }, { status: 'policy' }]) {
      const forged = structuredClone(original);
      Object.assign(forged.rows[0], mutation);
      await writeFile(target, JSON.stringify(forged));
      const before = await runtimeBytes(root);
      const result = cli(root, 'doctor', [], undefined, path.resolve('dist/cli/src/public.js'));
      assert.equal(result.exit, 0);
      const check = result.data.checks.find((entry) => entry.name === 'state cache');
      assert.equal(check.ok, false);
      assert.match(check.detail, /differs from the graph/);
      assert.deepEqual(await runtimeBytes(root), before);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

// Synthetic owner rows exist only in disposable stores; no approval operation is invoked.
async function preloadOwnerRecords(store, proposals) {
  const elements = proposals.map((proposal) => ({ ...proposal, supersedes: null, content_hash: contentHash(proposal) }))
    .sort((a, b) => a.element_id < b.element_id ? -1 : 1);
  const deltaHash = hash(elements);
  const commitId = `c${hash({ schema_version: 1, parents: ['ROOT'], branch: 'main', delta_hash: deltaHash, actor: 'human' })}`;
  const batch = elements.map((element) => blankRow({ ...element, props: canon(element.props),
    row_type: 'elem', row_key: `${element.element_id}@${commitId}`, commit_id: commitId }));
  batch.push(blankRow({ row_type: 'commit', row_key: `commit:${commitId}`, commit_id: commitId,
    branch: 'main', parents: '["ROOT"]', delta_hash: deltaHash, actor: 'human', generation: 1, committed_at: 1 }));
  batch.push(blankRow({ row_type: 'head', row_key: 'head:main', branch: 'main', head: commitId }));
  assert.equal(await store.publish(batch, 'ROOT'), true);
}

function provenanceRecord(id, status = 'hypothesis', kind = 'episode', props = {}) {
  return { element_id: id, kind, op: 'assert', status, src: null, dst: null, predicate: null,
    extent: null, props: { task: 'provenance', ...props }, source_hash: null,
    valid_from: 1, valid_to: null, observed_at: 1 };
}

test('remember rejects protected, absent and non-episode supersession while preserving live hypothesis chains', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'osg-security-supersession-'));
  try {
    assert.equal(cli(root, 'init').exit, 0);
    const store = await openStore(path.join(root, '.osg/store'));
    const protectedRows = ['approved', 'policy', 'observed'].map((status) => provenanceRecord(`agent:episode:${status}`, status));
    await preloadOwnerRecords(store, [...protectedRows, provenanceRecord('agent:restriction:ordinary', 'hypothesis', 'restriction')]);
    const before = await store.rows();
    const histories = await Promise.all(protectedRows.map((row) => history(store, row.element_id)));
    const result = cli(root, 'remember', ['--task', 'provenance', '--decision', 'ordinary claim', '--outcome', 'untrusted',
      '--entities', protectedRows[0].element_id,
      '--supersedes', [...protectedRows.map((row) => row.element_id), 'agent:restriction:ordinary', 'agent:episode:missing'].join(',')]);
    assert.equal(result.exit, 0);
    assert.equal(result.warnings.filter((warning) => warning.code === 'UNRESOLVED_SUPERSEDES').length, 5);
    const first = await remember(store, 'provenance', 'first', 'untrusted', []);
    const second = await remember(store, 'provenance', 'second', 'untrusted', [], { supersedes: [first.episodeId, first.episodeId] });
    const third = await remember(store, 'provenance', 'third', 'untrusted', [], { supersedes: [second.episodeId] });
    const packet = await context(store, 'provenance', 12000, async () => false);
    assert.deepEqual(packet.items.find((item) => item.elementId === second.episodeId).data.value.supersedes, [first.episodeId]);
    assert.equal(packet.items.find((item) => item.elementId === first.episodeId).provenance.supersededBy, second.episodeId);
    assert.equal(packet.items.find((item) => item.elementId === second.episodeId).provenance.supersededBy, third.episodeId);
    for (const [index, row] of protectedRows.entries()) {
      const item = packet.items.find((entry) => entry.elementId === row.element_id);
      assert.ok(item);
      assert.equal(item.provenance.supersededBy, undefined);
      assert.equal(item.provenance.status, row.status);
      assert.deepEqual((await history(store, row.element_id)).versions, histories[index].versions);
    }
    for (const original of before.filter((row) => row.row_type !== 'head')) {
      assert.deepEqual((await store.rows()).find((row) => row.row_key === original.row_key), original);
    }
    assert.equal(verify(await store.rows()).commits, 5);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('retrieval ignores forged protected, malformed, self and closed-source supersession metadata', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'osg-security-supersession-read-'));
  try {
    const store = await openStore(root, true);
    const records = ['approved', 'policy', 'observed', 'hypothesis'].flatMap((status) =>
      ['episode', 'restriction'].map((kind) => provenanceRecord(`agent:${kind}:${status}`, status, kind,
        status !== 'hypothesis' ? { supersedes: ['agent:episode:hypothesis'] } : {})));
    records.push(provenanceRecord('agent:episode:malformed', 'hypothesis', 'episode', { supersedes: [null, 42, {}] }));
    records.push(provenanceRecord('agent:episode:self', 'hypothesis', 'episode', { supersedes: ['agent:episode:self', 'agent:episode:missing'] }));
    records.push(provenanceRecord('agent:episode:closed', 'hypothesis', 'episode', { supersedes: ['agent:episode:hypothesis'] }));
    await preloadOwnerRecords(store, records);
    await commit(store, [{ ...provenanceRecord('agent:episode:closed'), op: 'retract', valid_from: 2 }], 'agent:cli');
    const beforePacket = await context(store, 'provenance', 16000, async () => false);
    const histories = await Promise.all(records.map((row) => history(store, row.element_id)));
    assert.equal(beforePacket.items.find((item) => item.elementId === 'agent:episode:hypothesis').provenance.supersededBy, undefined,
      'owner and observed episodes, malformed/self references and a retracted source cannot retire a live hypothesis');
    await commit(store, [provenanceRecord('agent:episode:attacker', 'hypothesis', 'episode',
      { supersedes: records.map((row) => row.element_id) })], 'agent:cli');
    const beforeRead = await store.rows();
    const packet = await context(store, 'provenance', 16000, async () => false);
    const eligible = new Set(['agent:episode:hypothesis', 'agent:episode:malformed', 'agent:episode:self']);
    for (const [index, row] of records.entries()) {
      const item = packet.items.find((entry) => entry.elementId === row.element_id);
      assert.equal(item?.provenance.supersededBy, eligible.has(row.element_id) ? 'agent:episode:attacker' : undefined, row.element_id);
      assert.deepEqual((await history(store, row.element_id)).versions, histories[index].versions);
    }
    const protectedIds = records.filter((row) => ['approved', 'policy'].includes(row.status)).map((row) => row.element_id);
    assert.deepEqual(packet.items.filter((item) => protectedIds.includes(item.elementId)).map((item) => item.elementId),
      beforePacket.items.filter((item) => protectedIds.includes(item.elementId)).map((item) => item.elementId));
    for (const id of protectedIds) {
      const before = beforePacket.items.find((item) => item.elementId === id);
      const after = packet.items.find((item) => item.elementId === id);
      if (before && after) assert.equal(after.reason.score, before.reason.score, id);
    }
    assert.deepEqual(await store.rows(), beforeRead, 'context must be a pure read');
    assert.deepEqual(verify(beforeRead), { commits: 3, elements: records.length + 2 });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('static hardlinks for ignore/config/export/store refuse outside inode writes', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'osg-security-hardlinks-'));
  const root = path.join(parent, 'workspace');
  const outside = path.join(parent, 'outside');
  try {
    await mkdir(root);
    await mkdir(outside);
    const sentinel = path.join(outside, 'sentinel');
    await writeFile(sentinel, 'outside bytes must never change\n');
    const before = await sentinelState(sentinel);
    const ignorePath = path.join(root, '.gitignore');
    await link(sentinel, ignorePath);
    assert.equal((await lstat(ignorePath)).nlink, 2);
    const refused = cli(root, 'init');
    assert.equal(refused.exit, 5);
    assert.equal(refused.error.code, 'INVALID_SCHEMA');
    assert.deepEqual(await sentinelState(sentinel), before);
    await rm(ignorePath);
    await writeFile(ignorePath, 'ordinary-existing-rule\n');
    assert.equal(cli(root, 'init').exit, 0);
    const normal = await readFile(ignorePath, 'utf8');
    assert.ok(normal.startsWith('ordinary-existing-rule\n'));
    for (const line of ['.osg/store/', '.osg/backup/', '.osg/cache/', '.osg/logs/', '.osg/export/']) {
      assert.equal(normal.split('\n').filter((value) => value === line).length, 1);
    }
    assert.equal(cli(root, 'init').exit, 0);
    assert.equal(await readFile(ignorePath, 'utf8'), normal);
    const configPath = path.join(root, '.osg/config.json');
    const config = await readFile(configPath, 'utf8');
    const configSentinel = path.join(outside, 'config-sentinel');
    await writeFile(configSentinel, config);
    const configBefore = await sentinelState(configSentinel);
    await rm(configPath);
    await link(configSentinel, configPath);
    for (const command of ['init', 'sync', 'export']) assert.equal(cli(root, command).exit, 5);
    assert.deepEqual(await sentinelState(configSentinel), configBefore);
    await rm(configPath);
    await writeFile(configPath, config);
    await mkdir(path.join(root, '.osg/export'), { recursive: true });
    const exportPath = path.join(root, '.osg/export/episodes.jsonl');
    await link(sentinel, exportPath);
    for (const command of ['init', 'sync', 'export']) assert.equal(cli(root, command).exit, 5);
    assert.deepEqual(await sentinelState(sentinel), before);
    await rm(exportPath);
    const storeLink = path.join(root, '.osg/store/hardlinked-file');
    await link(sentinel, storeLink);
    assert.equal(cli(root, 'sync').exit, 5);
    assert.deepEqual(await sentinelState(sentinel), before);
    await rm(storeLink);
    await rm(ignorePath);
    await mkdir(ignorePath);
    assert.equal(cli(root, 'init').exit, 5, 'nonregular ignore targets must fail safely');
    assert.deepEqual(await sentinelState(sentinel), before);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('nested ignore privacy applies before reads, persists no ignored facts/history/context, and cannot reenable protected paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'osg-security-ignore-'));
  try {
    const files = {
      '.gitignore': '*.private.ts\nblocked/\n!blocked/rescue.ts\n!.osg/\n!docs/tasks/\n',
      'public.ts': 'export const publicValue = 1;',
      'root.private.ts': 'export const privacyMarker = 1;',
      'nested/.gitignore': '/local.md\nsecret?.ts\n*.md\n!keep.md\n!allowed.private.ts\nchildren/*.ts\n!children/keep.ts\nclosed/\n',
      'nested/local.md': '# privacyMarker',
      'nested/secret1.ts': 'export const privacyMarker = 1;',
      'nested/drop.md': '# privacyMarker',
      'nested/keep.md': '# IncludedKeep',
      'nested/allowed.private.ts': 'export const allowedValue = 1;',
      'nested/children/.gitignore': '*.md\n!reopen.md\n',
      'nested/children/drop.ts': 'export const privacyMarker = 1;',
      'nested/children/keep.ts': 'export const keepValue = 1;',
      'nested/children/reopen.md': '# IncludedReopen',
      'nested/children/local.md': '# privacyMarker',
      'nested/closed/.gitignore': '!rescue.ts\n',
      'nested/closed/rescue.ts': 'export const privacyMarker = 1;',
      'blocked/.gitignore': '!rescue.ts\n',
      'blocked/rescue.ts': 'export const privacyMarker = 1;',
      'sibling/local.md': '# IncludedSibling',
      'docs/.gitignore': '!tasks/\n!tasks/**\n',
      'docs/tasks/private.md': '# privacyMarker',
      '.osg/private.ts': 'export const privacyMarker = 1;',
      'nested/.env.fixture.md': '# SyntheticRestrictedMarker'
    };
    for (const [relative, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
      await writeFile(path.join(root, relative), text);
    }
    // Guard the provider's filesystem import: ignored supported files AND ignore files in
    // pruned ancestors must never be opened. All content here is synthetic, not secrets.
    const denied = Object.keys(files).filter((relative) => files[relative].includes('privacyMarker') ||
      relative === 'nested/.env.fixture.md' || ['blocked/.gitignore', 'nested/closed/.gitignore'].includes(relative));
    const guardModule = `import * as fs from 'node:fs/promises'; import path from 'node:path';
      export const lstat=fs.lstat, readdir=fs.readdir, realpath=fs.realpath;
      const denied=new Set(${JSON.stringify(denied.map((relative) => path.join(root, relative)))});
      export async function readFile(target,...args) { if(denied.has(path.resolve(String(target)))) throw new Error('PRIVACY_READ:'+target); return fs.readFile(target,...args); }`;
    const hook = moduleHooks(`const hooks = {resolve(specifier,context,next) {
      if(specifier==='node:fs/promises' && context.parentURL?.includes('/indexing-kilo/src/')) return {url:${JSON.stringify(`data:text/javascript,${encodeURIComponent(guardModule)}`)},shortCircuit:true};
      return next(specifier,context);
    }};`);
    assert.equal(cli(root, 'init').exit, 0);
    const synced = cli(root, 'sync', [], hook);
    assert.equal(synced.exit, 0, JSON.stringify(synced));
    assert.equal(synced.data.files, 6);
    assert.equal(cli(root, 'sync', [], hook).data.noop, true);
    const store = await openStore(path.join(root, '.osg/store'));
    const rows = await store.rows();
    const visible = snapshot(rows, await store.head('main'));
    assert.deepEqual([...visible.state.values()].filter((row) => row.kind === 'file').map((row) => JSON.parse(row.props).path).sort(),
      ['nested/allowed.private.ts', 'nested/children/keep.ts', 'nested/children/reopen.md', 'nested/keep.md', 'public.ts', 'sibling/local.md']);
    assert.ok(!JSON.stringify(rows).includes('privacyMarker'));
    for (const relative of denied.filter((relative) => /\.(ts|md)$/.test(relative))) {
      assert.ok(!rows.some((row) => row.element_id?.includes(relative)), relative);
      const history = cli(root, 'history', ['--entity', `code:file:${relative}`]);
      assert.equal(history.exit, 0);
      assert.deepEqual(history.data.versions, []);
      const packet = cli(root, 'context', ['--entity', `code:file:${relative}`]);
      assert.equal(packet.exit, 0);
      assert.ok(packet.data.items.every((item) => !item.elementId.includes(relative) && item.citation?.path !== relative),
        'lexical fallback may return permitted files, never the ignored identity or citation');
      assert.ok(!JSON.stringify(packet.data.items).includes('privacyMarker'));
    }
    assert.deepEqual(cli(root, 'context', ['--task', 'privacyMarker']).data.items, []);
    assert.equal(cli(root, 'verify').exit, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('platform-aware nested mixed-case ignore privacy precedes reads and preserves case-sensitive identities', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'osg-security-ignore-case-'));
  try {
    const windows = process.platform === 'win32';
    const files = {
      '.gitignore': 'secrets/\n!Secrets/rescue.ts\n*.PRIVATE.ts\n!.osg/**\n!docs/tasks/**\n',
      'Secrets/.gitignore': '!rescue.ts\n',
      'Secrets/rescue.ts': 'export const mixedCasePrivacyMarker = 1;',
      'nested/.gitignore': 'vault/\n!Vault/rescue.ts\nsecret?.ts\n!SECRET2.ts\n!allowed.private.ts\n',
      'nested/Vault/.gitignore': '!rescue.ts\n',
      'nested/Vault/rescue.ts': 'export const mixedCasePrivacyMarker = 1;',
      'nested/Secret1.ts': 'export const mixedCasePrivacyMarker = 1;',
      'nested/SECRET2.ts': 'export const IncludedUpper = 1;',
      'nested/drop.private.ts': 'export const mixedCasePrivacyMarker = 1;',
      'nested/allowed.private.ts': 'export const IncludedAllowed = 1;',
      'Public.ts': 'export const CaseName = 1;',
      'docs/.gitignore': '!tasks/\n!tasks/**\n',
      'docs/tasks/private.ts': 'export const mixedCasePrivacyMarker = 1;',
      '.osg/private.ts': 'export const mixedCasePrivacyMarker = 1;'
    };
    for (const [relative, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
      await writeFile(path.join(root, relative), text);
    }
    const protectedPaths = ['docs/tasks/private.ts', '.osg/private.ts'];
    const mixedIgnored = ['Secrets/.gitignore', 'Secrets/rescue.ts', 'nested/Vault/.gitignore',
      'nested/Vault/rescue.ts', 'nested/Secret1.ts', 'nested/drop.private.ts'];
    const denied = [...protectedPaths, ...(windows ? mixedIgnored : [])];
    const guardModule = `import * as fs from 'node:fs/promises'; import path from 'node:path';
      export const lstat=fs.lstat, readdir=fs.readdir, realpath=fs.realpath;
      const denied=new Set(${JSON.stringify(denied.map((relative) => path.join(root, relative)))});
      export async function readFile(target,...args) { if(denied.has(path.resolve(String(target)))) throw new Error('PRIVACY_READ:'+target); return fs.readFile(target,...args); }`;
    const hook = moduleHooks(`const hooks = {resolve(specifier,context,next) {
      if(specifier==='node:fs/promises' && context.parentURL?.includes('/indexing-kilo/src/')) return {url:${JSON.stringify(`data:text/javascript,${encodeURIComponent(guardModule)}`)},shortCircuit:true};
      return next(specifier,context);
    }};`);
    assert.equal(cli(root, 'init').exit, 0);
    const synced = cli(root, 'sync', [], hook);
    assert.equal(synced.exit, 0, JSON.stringify(synced));
    const store = await openStore(path.join(root, '.osg/store'));
    const rows = await store.rows();
    const visible = snapshot(rows, await store.head('main'));
    const expected = ['Public.ts', 'nested/SECRET2.ts', 'nested/allowed.private.ts',
      ...(windows ? [] : mixedIgnored.filter((relative) => relative.endsWith('.ts')))];
    assert.equal(synced.data.files, expected.length);
    assert.deepEqual([...visible.state.values()].filter((row) => row.kind === 'file')
      .map((row) => JSON.parse(row.props).path).sort(), expected.sort());
    assert.ok(visible.state.has('code:file:Public.ts'));
    assert.ok(visible.state.has('code:symbol:Public.ts#CaseName'));
    assert.ok(!visible.state.has('code:file:public.ts'));
    assert.ok(!visible.state.has('code:symbol:Public.ts#casename'));
    for (const relative of denied) assert.ok(!rows.some((row) => row.element_id?.includes(relative)), relative);
    if (windows) assert.ok(!JSON.stringify(rows).includes('mixedCasePrivacyMarker'));
    assert.equal(cli(root, 'sync', [], hook).data.noop, true);
    assert.equal(cli(root, 'verify').exit, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('mandatory mixed-case exclusions prune before reads and never persist fresh private facts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'osg-security-mandatory-case-'));
  try {
    const windows = process.platform === 'win32';
    const mixedDirectories = ['.OSG', 'docs/Tasks', '.SpeXcode', '.Git', '.Understand-Anything',
      '.KiloCode', 'Node_Modules', 'Dist', 'Build', 'nested/Credentials.JSON', 'nested/SuperSecrets.TXT'];
    const alwaysExcluded = ['nested/.ENV.fixture.MD', 'nested/.env.local.ts'];
    const mixedFiles = ['nested/Types.d.TS'];
    const privateFiles = mixedDirectories.map((directory) => `${directory}/private.md`);
    const files = {
      '.gitignore': mixedDirectories.map((directory) => `!${directory}/\n!${directory}/**`).join('\n') + '\n',
      'docs/.gitignore': '!Tasks/\n!Tasks/**\n',
      'Public.ts': 'export const CaseName = 1;',
      'public.md': '# IncludedPublic',
      ...Object.fromEntries(mixedDirectories.flatMap((directory) => [
        [`${directory}/.gitignore`, '!private.md\n'],
        [`${directory}/private.md`, '# MandatoryPrivacyMarker']
      ])),
      ...Object.fromEntries([...alwaysExcluded, ...mixedFiles].map((relative) => [relative, '# MandatoryPrivacyMarker']))
    };
    for (const [relative, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
      await writeFile(path.join(root, relative), text);
    }
    // Only disposable synthetic fixtures are used, including sensitive filename variants.
    // Guard traversal and ignore reads as well as content reads beneath pruned ancestors.
    const denied = [...alwaysExcluded, ...(windows ? [...mixedDirectories, ...mixedFiles] : [])];
    const guardModule = `import * as fs from 'node:fs/promises'; import path from 'node:path';
      const normalize=value=>${windows ? 'value.toLowerCase()' : 'value'};
      const denied=${JSON.stringify(denied.map((relative) => path.join(root, relative)))}.map(normalize);
      function guard(target) { const value=normalize(path.resolve(String(target))); if(denied.some(item=>value===item||value.startsWith(item+path.sep))) throw new Error('MANDATORY_PRIVACY_READ:'+target); }
      export const realpath=fs.realpath;
      export async function lstat(target,...args) { guard(target); return fs.lstat(target,...args); }
      export async function readdir(target,...args) { guard(target); return fs.readdir(target,...args); }
      export async function readFile(target,...args) { guard(target); return fs.readFile(target,...args); }`;
    const hook = moduleHooks(`const hooks = {resolve(specifier,context,next) {
      if(specifier==='node:fs/promises' && context.parentURL?.includes('/indexing-kilo/src/')) return {url:${JSON.stringify(`data:text/javascript,${encodeURIComponent(guardModule)}`)},shortCircuit:true};
      return next(specifier,context);
    }};`);
    assert.equal(cli(root, 'init').exit, 0);
    const synced = cli(root, 'sync', [], hook);
    assert.equal(synced.exit, 0, JSON.stringify(synced));
    const store = await openStore(path.join(root, '.osg/store'));
    const rows = await store.rows();
    const visible = snapshot(rows, await store.head('main'));
    const expected = ['Public.ts', 'public.md', ...(windows ? [] : [...privateFiles, ...mixedFiles])];
    assert.equal(synced.data.files, expected.length);
    assert.deepEqual([...visible.state.values()].filter((row) => row.kind === 'file')
      .map((row) => JSON.parse(row.props).path).sort(), expected.sort());
    assert.ok(visible.state.has('code:file:Public.ts'));
    assert.ok(visible.state.has('code:symbol:Public.ts#CaseName'));
    assert.ok(!visible.state.has('code:file:public.ts'));
    assert.equal(rows.filter((row) => row.row_type === 'commit').length, 1);
    if (windows) assert.ok(!JSON.stringify(rows).includes('MandatoryPrivacyMarker'));
    for (const relative of [...alwaysExcluded, ...(windows ? [...privateFiles, ...mixedFiles] : [])]) {
      assert.ok(!rows.some((row) => row.element_id?.includes(relative)), relative);
      const past = cli(root, 'history', ['--entity', `code:file:${relative}`]);
      assert.equal(past.exit, 0);
      assert.deepEqual(past.data.versions, []);
      const packet = cli(root, 'context', ['--entity', `code:file:${relative}`]);
      assert.equal(packet.exit, 0);
      assert.ok(packet.data.items.every((item) => item.citation?.path !== relative && !item.elementId.includes(relative)));
    }
    if (windows) assert.deepEqual(cli(root, 'context', ['--task', 'MandatoryPrivacyMarker']).data.items, []);
    assert.equal(cli(root, 'sync', [], hook).data.noop, true);
    assert.deepEqual(await store.rows(), rows, 'repeat scan creates no private element or extra commit rows');
    assert.equal(cli(root, 'verify').exit, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Windows CocoaPods directories are pruned before traversal, reads and history', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'osg-security-pods-'));
  try {
    const variants = ['Pods', 'pOdS'];
    await writeFile(path.join(root, '.gitignore'), '!Pods/\n!Pods/**\n!pOdS/\n!pOdS/**\n');
    for (const directory of variants) {
      await mkdir(path.join(root, directory), { recursive: true });
      await writeFile(path.join(root, directory, '.gitignore'), '!private.md\n');
      await writeFile(path.join(root, directory, 'private.md'), '# CocoaPodsPrivateMarker');
    }
    await writeFile(path.join(root, 'public.md'), '# PublicMarker');
    const denied = variants.map((directory) => path.join(root, directory).toLowerCase());
    const guardModule = `import * as fs from 'node:fs/promises'; import path from 'node:path';
      const denied=${JSON.stringify(denied)};
      function guard(target) { const value=path.resolve(String(target)).toLowerCase(); if(denied.some(item=>value===item||value.startsWith(item+path.sep))) throw Error('PODS_PRIVACY_READ'); }
      export const realpath=fs.realpath;
      export async function lstat(target,...args) { guard(target); return fs.lstat(target,...args); }
      export async function readdir(target,...args) { guard(target); return fs.readdir(target,...args); }
      export async function readFile(target,...args) { guard(target); return fs.readFile(target,...args); }`;
    const hook = moduleHooks(`const hooks = {resolve(specifier,context,next) {
      if(specifier==='node:fs/promises' && context.parentURL?.includes('/indexing-kilo/src/')) return {url:${JSON.stringify(`data:text/javascript,${encodeURIComponent(guardModule)}`)},shortCircuit:true};
      return next(specifier,context);
    }};`);
    assert.equal(cli(root, 'init').exit, 0);
    const synced = cli(root, 'sync', [], hook);
    assert.equal(synced.exit, 0, JSON.stringify(synced));
    assert.equal(synced.data.files, 1);
    const store = await openStore(path.join(root, '.osg/store'));
    const rows = await store.rows();
    assert.ok(!JSON.stringify(rows).includes('CocoaPodsPrivateMarker'));
    for (const directory of variants) {
      assert.deepEqual(cli(root, 'history', ['--entity', `code:file:${directory}/private.md`]).data.versions, []);
      assert.ok(!rows.some((row) => row.element_id?.includes(`${directory}/`)));
    }
    assert.equal(cli(root, 'sync', [], hook).data.noop, true);
    assert.deepEqual(await store.rows(), rows);
    assert.equal(cli(root, 'verify').exit, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('mandatory exclusions reconcile prior leaked current facts without purging append-only history', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'osg-security-mandatory-reconcile-'));
  try {
    const paths = process.platform === 'win32'
      ? ['.OSG/private.md', 'docs/Tasks/private.md', '.SpeXcode/private.md']
      : ['.osg/private.md', 'docs/tasks/private.md', '.spexcode/private.md'];
    for (const relative of paths) {
      await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
      await writeFile(path.join(root, relative), '# PriorMandatoryPrivacyMarker');
    }
    assert.equal(cli(root, 'init').exit, 0);
    const store = await openStore(path.join(root, '.osg/store'));
    // Model previously leaked observed rows, never bypass the new scanner to read secrets.
    const proposals = paths.flatMap((relative) => {
      const fileId = `code:file:${relative}`;
      const headingId = `doc:doc:${relative}#prior`;
      const base = { op: 'assert', status: 'observed', src: null, dst: null, predicate: null,
        extent: { frame_id: fileId, t: null, q: null, ext_min: [1], ext_max: [1] },
        props: { name: 'PriorMandatoryPrivacyMarker', path: relative }, source_hash: null,
        valid_from: 1, valid_to: null, observed_at: 1 };
      return [{ ...base, element_id: fileId, kind: 'file' }, { ...base, element_id: headingId, kind: 'heading' }];
    });
    const prior = await commit(store, proposals, 'provider-tsc@0.1.0');
    const originalRows = (await store.rows()).filter((row) => row.row_type !== 'head');
    const synced = cli(root, 'sync');
    assert.equal(synced.exit, 0, JSON.stringify(synced));
    assert.equal(synced.data.files, 0);
    assert.equal(synced.data.changes, proposals.length);
    const rows = await store.rows();
    assert.equal(snapshot(rows, await store.head('main')).state.size, 0);
    for (const original of originalRows) assert.deepEqual(rows.find((row) => row.row_key === original.row_key), original);
    assert.equal(snapshot(rows, prior.commitId).state.size, proposals.length, 'old leaked history remains reachable');
    for (const proposal of proposals) {
      const past = cli(root, 'history', ['--entity', proposal.element_id]);
      assert.equal(past.exit, 0);
      assert.equal(past.data.current, false);
      assert.deepEqual(past.data.versions.map((version) => version.operation), ['assert', 'retract']);
      assert.equal(past.data.versions[0].props.value.name, 'PriorMandatoryPrivacyMarker');
      const packet = cli(root, 'context', ['--entity', proposal.element_id]);
      assert.equal(packet.exit, 0);
      assert.deepEqual(packet.data.items, []);
    }
    assert.deepEqual(cli(root, 'context', ['--task', 'PriorMandatoryPrivacyMarker']).data.items, []);
    assert.equal(cli(root, 'sync').data.noop, true);
    assert.equal(cli(root, 'verify').exit, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('bounded ignore replacement sharing failures report actionable storage errors and recover on rerun', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'osg-security-ignore-sharing-'));
  try {
    const ignorePath = path.join(root, '.gitignore');
    await writeFile(ignorePath, 'existing-rule\n');
    const before = await sentinelState(ignorePath);
    for (const code of ['EPERM', 'EACCES', 'EBUSY', 'EIO']) {
      const expectedAttempts = code === 'EIO' ? 1 : 21;
      const guardModule = `import * as fs from 'node:fs/promises'; import path from 'node:path';
        export const appendFile=fs.appendFile,cp=fs.cp,stat=fs.stat,link=fs.link,lstat=fs.lstat,mkdir=fs.mkdir,readFile=fs.readFile,readdir=fs.readdir,
          realpath=fs.realpath,rm=fs.rm,writeFile=fs.writeFile;
        let attempts=0;
        process.on('exit',()=>{if(attempts!==${expectedAttempts}) process.exitCode=99;});
        export async function rename(source,target) {
          if(path.basename(String(target))!=='.gitignore') return fs.rename(source,target);
          attempts++;
          throw Object.assign(new Error('injected ${code} '+target),{code:${JSON.stringify(code)}});
        }`;
      const hook = moduleHooks(`const hooks = {resolve(specifier,context,next) {
        if(specifier==='node:fs/promises' && context.parentURL?.includes('/cli/src/')) return {url:${JSON.stringify(`data:text/javascript,${encodeURIComponent(guardModule)}`)},shortCircuit:true};
        return next(specifier,context);
      }};`);
      const failed = cli(root, 'init', [], hook);
      assert.equal(failed.exit, code === 'EIO' ? 1 : 6, JSON.stringify(failed));
      assert.equal(failed.error.code, code === 'EIO' ? 'INTERNAL' : 'STORAGE_UNAVAILABLE');
      assert.equal(failed.error.category, code === 'EIO' ? 'internal' : 'storage');
      assert.equal(failed.data, null);
      if (code !== 'EIO') {
        assert.match(failed.error.message, /release.*(?:lock|sharing).*rerun init/i);
        assert.match(failed.error.message, /initialized.*ignore/i);
        assert.ok(!JSON.stringify(failed.error).includes(root));
        assert.ok(!failed.error.message.includes(`injected ${code}`));
      } else assert.equal(failed.error.message, 'Internal error');
      assert.equal(failed.graphCommitId, 'ROOT', 'storage initialization may already have succeeded');
      assert.ok(failed.workspaceId);
      assert.deepEqual(await sentinelState(ignorePath), before);
      assert.deepEqual((await readdir(root)).filter((name) => name.startsWith('.gitignore-')), []);
    }
    const configBefore = await readFile(path.join(root, '.osg/config.json'), 'utf8');
    assert.equal(cli(root, 'init').exit, 0);
    assert.equal(await readFile(path.join(root, '.osg/config.json'), 'utf8'), configBefore);
    const recovered = await readFile(ignorePath, 'utf8');
    assert.ok(recovered.startsWith('existing-rule\n'));
    for (const line of ['.osg/store/', '.osg/backup/', '.osg/cache/', '.osg/logs/', '.osg/export/']) {
      assert.equal(recovered.split('\n').filter((value) => value === line).length, 1);
    }
    assert.equal(cli(root, 'init').data.ignoreUpdated, false);
    assert.equal(cli(root, 'verify').exit, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('public commit refuses observed/hypothesis replacement and retraction of low-level approved/policy states', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'osg-security-protected-'));
  try {
    const store = await openStore(root, true);
    const elements = ['approved', 'policy'].map((status) => {
      const element = { element_id: `policy:restriction:${status}`, kind: 'restriction', op: 'assert', status,
        src: null, dst: null, predicate: null, extent: null, props: { rule: 'owner-controlled' }, source_hash: null,
        valid_from: 1, valid_to: null, observed_at: 1, supersedes: null };
      return { ...element, content_hash: contentHash(element) };
    });
    const deltaHash = hash(elements);
    const commitId = `c${hash({ schema_version: 1, parents: ['ROOT'], branch: 'main', delta_hash: deltaHash, actor: 'human' })}`;
    const batch = elements.map((element) => blankRow({ ...element, props: canon(element.props),
      row_type: 'elem', row_key: `${element.element_id}@${commitId}`, commit_id: commitId }));
    batch.push(blankRow({ row_type: 'commit', row_key: `commit:${commitId}`, commit_id: commitId,
      branch: 'main', parents: '["ROOT"]', delta_hash: deltaHash, actor: 'human', generation: 1, committed_at: 1 }));
    batch.push(blankRow({ row_type: 'head', row_key: 'head:main', branch: 'main', head: commitId }));
    assert.equal(await store.publish(batch, 'ROOT'), true, 'fixture preloads authority through storage, not an approval shortcut');
    const before = await store.rows();
    assert.deepEqual(verify(before), { commits: 1, elements: 2 });
    for (const element of elements) {
      const { content_hash, ...proposal } = element;
      await assert.rejects(commit(store, [{ ...proposal, element_id: `${element.element_id}-forged` }], 'human'),
        { code: 'INVALID_SCHEMA' }, 'public commit must not create protected statuses');
    }
    assert.deepEqual(await store.rows(), before);
    for (const protectedElement of elements) for (const status of ['observed', 'hypothesis']) for (const op of ['assert', 'retract']) {
      for (const explicit of [false, true]) {
        const { content_hash, supersedes, ...proposal } = protectedElement;
        const replacement = { ...proposal, status, op, props: { rule: 'agent-replacement' }, valid_from: 2,
          ...(explicit ? { supersedes: `${proposal.element_id}@${commitId}` } : {}) };
        await assert.rejects(commit(store, [replacement], status === 'observed' ? 'provider-tsc@0.1.0' : 'agent:cli'),
          { code: 'INVALID_DELTA', message: /Protected state/ });
        // A caller-controlled actor label is not an authorization mechanism.
        await assert.rejects(commit(store, [replacement], 'human'), { code: 'INVALID_DELTA' });
        assert.equal(await store.head('main'), commitId);
        assert.deepEqual(await store.rows(), before, 'rejection must happen before any row publication');
      }
    }
    assert.deepEqual(verify(await store.rows()), { commits: 1, elements: 2 });
    assert.deepEqual([...snapshot(await store.rows(), commitId).state.values()].map((row) => row.status).sort(), ['approved', 'policy']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
