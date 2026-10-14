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

const entry = path.resolve('dist/cli/src/index.js');
function cli(root, command, args = [], hook) {
  const result = spawnSync(process.execPath, [...(hook ? ['--import', `data:text/javascript,${encodeURIComponent(hook)}`] : []),
    entry, command, ...(command === 'export' ? ['episodes'] : []), '--workspace', root, ...args, '--json'],
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
    const hook = `import {registerHooks} from 'node:module'; registerHooks({resolve(specifier,context,next) {
      if(specifier==='node:fs/promises' && context.parentURL?.includes('/indexing-kilo/src/')) return {url:${JSON.stringify(`data:text/javascript,${encodeURIComponent(guardModule)}`)},shortCircuit:true};
      return next(specifier,context);
    }});`;
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
    const hook = `import {registerHooks} from 'node:module'; registerHooks({resolve(specifier,context,next) {
      if(specifier==='node:fs/promises' && context.parentURL?.includes('/indexing-kilo/src/')) return {url:${JSON.stringify(`data:text/javascript,${encodeURIComponent(guardModule)}`)},shortCircuit:true};
      return next(specifier,context);
    }});`;
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
    const hook = `import {registerHooks} from 'node:module'; registerHooks({resolve(specifier,context,next) {
      if(specifier==='node:fs/promises' && context.parentURL?.includes('/indexing-kilo/src/')) return {url:${JSON.stringify(`data:text/javascript,${encodeURIComponent(guardModule)}`)},shortCircuit:true};
      return next(specifier,context);
    }});`;
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
        export const link=fs.link,lstat=fs.lstat,mkdir=fs.mkdir,readFile=fs.readFile,readdir=fs.readdir,
          realpath=fs.realpath,rm=fs.rm,writeFile=fs.writeFile;
        let attempts=0;
        process.on('exit',()=>{if(attempts!==${expectedAttempts}) process.exitCode=99;});
        export async function rename(source,target) {
          if(path.basename(String(target))!=='.gitignore') return fs.rename(source,target);
          attempts++;
          throw Object.assign(new Error('injected ${code} '+target),{code:${JSON.stringify(code)}});
        }`;
      const hook = `import {registerHooks} from 'node:module'; registerHooks({resolve(specifier,context,next) {
        if(specifier==='node:fs/promises' && context.parentURL?.includes('/cli/src/')) return {url:${JSON.stringify(`data:text/javascript,${encodeURIComponent(guardModule)}`)},shortCircuit:true};
        return next(specifier,context);
      }});`;
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
