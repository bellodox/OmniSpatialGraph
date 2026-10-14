#!/usr/bin/env node
import { randomUUID, createHash } from 'node:crypto';
import { link, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { OsgError, type GraphRow } from '../../contracts/src/index.js';
import { scan } from '../../indexing-kilo/src/index.js';
import { context, history, remember, sync } from '../../core/src/memory.js';
import { snapshot, verify } from '../../core/src/graph.js';

type Warning = { code: string; message: string };
const supported = new Set(['help', 'init', 'sync', 'remember', 'context', 'history', 'verify', 'export']);
const choices: Record<string, Set<string>> = {
  help: new Set(['json']), init: new Set(['workspace', 'json']), sync: new Set(['workspace', 'json']),
  remember: new Set(['workspace', 'task', 'decision', 'outcome', 'entities', 'json']),
  context: new Set(['workspace', 'task', 'entity', 'max-tokens', 'json']),
  history: new Set(['workspace', 'entity', 'commit', 'json']),
  verify: new Set(['workspace', 'commit', 'json']), export: new Set(['workspace', 'json'])
};
const exits: Record<string, number> = { USAGE: 2, STALE_HEAD: 3, STATE_CONFLICT: 4, INVALID_DELTA: 5,
  INVALID_SCHEMA: 5, STORAGE_UNAVAILABLE: 6, NOT_INITIALIZED: 6, BRANCH_NOT_FOUND: 7,
  COMMIT_NOT_FOUND: 7, VERIFY_FAILED: 8, UNSUPPORTED_OPERATION: 9 };
const categories: Record<number, string> = { 1: 'internal', 2: 'invalid', 3: 'conflict', 4: 'conflict', 5: 'invalid',
  6: 'storage', 7: 'notFound', 8: 'storage', 9: 'unsupported' };

function parse(argv: string[]): { command: string; options: Record<string, string> } {
  const [command = 'help', ...args] = argv;
  if (!supported.has(command)) throw new OsgError('UNSUPPORTED_OPERATION', `Unsupported command: ${command}`);
  const options: Record<string, string> = {};
  if (command === 'export' && args.shift() !== 'episodes') throw new OsgError('USAGE', 'Expected export episodes');
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (!flag.startsWith('--') || !choices[command]!.has(flag.slice(2)) || options[flag.slice(2)] !== undefined) throw new OsgError('USAGE', `Unknown or repeated argument ${flag}`);
    const name = flag.slice(2);
    if (name === 'json') { options[name] = 'true'; continue; }
    if (!args[index + 1] || args[index + 1]!.startsWith('--')) throw new OsgError('USAGE', `Missing value for ${flag}`);
    options[name] = args[++index]!;
  }
  if (command === 'remember' && (!options.task || !options.decision || !options.outcome || !options.entities)) throw new OsgError('USAGE', 'Missing remember fields');
  if (command === 'history' && !options.entity) throw new OsgError('USAGE', 'Missing entity');
  if (command === 'context' && Number(!!options.task) + Number(!!options.entity) !== 1) throw new OsgError('USAGE', 'Specify exactly one task or entity');
  if (options['max-tokens'] && (!/^[1-9]\d*$/.test(options['max-tokens']) || !Number.isSafeInteger(Number(options['max-tokens'])))) throw new OsgError('USAGE', 'Invalid token budget');
  return { command, options };
}

async function safeDirectory(directory: string, create = false): Promise<void> {
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new OsgError('INVALID_SCHEMA', 'Runtime path is not a real directory');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (!create) throw new OsgError('NOT_INITIALIZED', 'Run init first');
    try { await mkdir(directory); }
    catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
      await safeDirectory(directory);
    }
  }
}

async function safeFile(target: string): Promise<void> {
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) {
    throw new OsgError('INVALID_SCHEMA', 'Nonregular or linked runtime file rejected');
  }
}

async function rejectRuntimeLinks(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new OsgError('INVALID_SCHEMA', 'Runtime symlink rejected');
    if (entry.isDirectory()) await rejectRuntimeLinks(target);
    else {
      try { await safeFile(target); }
      catch (error) {
        // Another initializer may remove its exclusively created config staging entry.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
}

function configWorkspaceId(text: string): string {
  let config: unknown;
  try { config = JSON.parse(text) as unknown; }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new OsgError('INVALID_SCHEMA', 'Invalid runtime config JSON');
  }
  if (config === null || typeof config !== 'object' || Array.isArray(config)) throw new OsgError('INVALID_SCHEMA', 'Invalid runtime config');
  const { schemaVersion, workspaceId } = config as Record<string, unknown>;
  if (schemaVersion !== 1 || typeof workspaceId !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(workspaceId)) {
    throw new OsgError('INVALID_SCHEMA', 'Invalid runtime config');
  }
  return workspaceId;
}

async function settledConfig(target: string): Promise<void> {
  // Config publication briefly has two internal links; wait for the publisher to unlink staging.
  // A static hardlink still fails closed. This is not a hostile concurrent-TOCTOU guarantee.
  for (let attempt = 0; attempt < 20; attempt++) {
    const stat = await lstat(target);
    if (stat.isFile() && stat.nlink > 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      continue;
    }
    await safeFile(target);
    return;
  }
  await safeFile(target);
}

async function runtime(workspace: string, create = false) {
  let root: string;
  try { root = await realpath(workspace); }
  catch { throw new OsgError('INVALID_SCHEMA', 'Workspace must be an existing directory'); }
  const run = path.join(root, '.osg');
  await safeDirectory(run, create);
  const storePath = path.join(run, 'store');
  await safeDirectory(storePath, create);
  const configPath = path.join(run, 'config.json');
  let workspaceId: string;
  if (create) {
    try {
      await settledConfig(configPath);
      workspaceId = configWorkspaceId(await readFile(configPath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      workspaceId = randomUUID();
      const temporaryConfig = path.join(run, `config-${randomUUID()}.tmp`);
      try {
        await writeFile(temporaryConfig, JSON.stringify({ schemaVersion: 1, workspaceId }), { flag: 'wx' });
        // An exclusive link publishes complete config bytes without replacing another initializer's identity.
        try { await link(temporaryConfig, configPath); }
        catch (cause) {
          if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
          await settledConfig(configPath);
          workspaceId = configWorkspaceId(await readFile(configPath, 'utf8'));
        }
      } finally { await rm(temporaryConfig, { force: true }); }
    }
  } else {
    try {
      await settledConfig(configPath);
      workspaceId = configWorkspaceId(await readFile(configPath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      throw new OsgError('NOT_INITIALIZED', 'Runtime configuration is missing; run init first');
    }
  }
  await rejectRuntimeLinks(run);
  return { root, run, storePath, workspaceId };
}

async function ensureIgnored(root: string, retries = 20): Promise<boolean> {
  const ignorePath = path.join(root, '.gitignore');
  const required = ['.osg/store/', '.osg/backup/', '.osg/cache/', '.osg/logs/', '.osg/export/'];
  let prior = '';
  let exists = false;
  try {
    await safeFile(ignorePath);
    exists = true;
    prior = await readFile(ignorePath, 'utf8');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const missing = required.filter((line) => !prior.split(/\r?\n/).includes(line));
  if (!missing.length) return false;
  const temporary = path.join(root, `.gitignore-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${prior}${prior && !prior.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`, { flag: 'wx' });
    if (exists) {
      await safeFile(ignorePath);
      // Replace only this directory entry; never truncate a potentially linkable inode.
      await rename(temporary, ignorePath);
    } else {
      // Concurrent initializers publish the same required lines without a partial/linkable target.
      await rename(temporary, ignorePath);
    }
  } catch (error) {
    // Windows may deny replacement while another initializer is reading the target.
    // Retry from current bytes, never fall back to truncation or unlinking the target.
    if (!['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    if (!retries) throw new OsgError('STORAGE_UNAVAILABLE',
      'Workspace storage initialized, but ignore-file update failed; release file locks or sharing restrictions and rerun init.');
    await rm(temporary, { force: true });
    await new Promise((resolve) => setTimeout(resolve, 10));
    return ensureIgnored(root, retries - 1);
  } finally { await rm(temporary, { force: true }); }
  return true;
}

async function exportEpisodes(run: string, rows: GraphRow[], head: string) {
  const exported = path.join(run, 'export');
  await safeDirectory(exported, true);
  const target = path.join(exported, 'episodes.jsonl');
  try { await safeFile(target); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const view = snapshot(rows, head);
  const episodes = rows.filter((row) => row.row_type === 'elem' && row.kind === 'episode' && row.op === 'assert' && view.reachable.has(row.commit_id!))
    .sort((a, b) => view.commits.get(a.commit_id!)!.generation! - view.commits.get(b.commit_id!)!.generation! || (a.element_id < b.element_id ? -1 : 1));
  const body = episodes.map((row) => JSON.stringify({ episodeId: row.element_id, commitId: row.commit_id,
    status: row.status, data: { untrusted: true, value: JSON.parse(row.props ?? '{}') } })).join('\n') + (episodes.length ? '\n' : '');
  const temp = path.join(exported, `${randomUUID()}.tmp`);
  await writeFile(temp, body, { flag: 'wx' });
  try { await rename(temp, target); } catch (error) { await rm(temp, { force: true }); throw error; }
  return { episodes: episodes.length, path: '.osg/export/episodes.jsonl' };
}

async function main() {
  const requestId = randomUUID();
  let workspaceId: string | null = null;
  let branch: string | null = null;
  let graphCommitId: string | null = null;
  let warnings: Warning[] = [];
  try {
    const { command, options } = parse(process.argv.slice(2));
    let data: unknown;
    if (command === 'help') data = { commands: [...supported].sort(), provider: 'independent-typescript-compiler-api@0.1.0', unsupported: ['approve', 'watch', 'query', 'scan', 'status', 'branch', 'graph', 'diff', 'propose', 'commit', 'doctor', 'maintain', 'vectors', 'server'] };
    else {
      const scope = await runtime(options.workspace ?? process.cwd(), command === 'init');
      workspaceId = scope.workspaceId;
      branch = 'main';
      let storage: typeof import('../../storage-lance/src/index.js');
      try { storage = await import('../../storage-lance/src/index.js'); }
      catch (error) { throw new OsgError('STORAGE_UNAVAILABLE', 'Unable to load storage adapter', { cause: String(error) }); }
      const store = await storage.openStore(scope.storePath, command === 'init');
      graphCommitId = await store.head('main');
      if (command === 'init') data = { initialized: true, noop: graphCommitId !== 'ROOT', ignoreUpdated: await ensureIgnored(scope.root) };
      if (command === 'sync') {
        const result = await sync(store, () => scan(scope.root));
        graphCommitId = result.commitId;
        warnings = result.warnings;
        data = { commitId: result.commitId, noop: result.noop, idempotent: result.idempotent, changes: result.count, files: result.files };
      }
      if (command === 'remember') {
        const result = await remember(store, options.task!, options.decision!, options.outcome!, options.entities?.split(',').filter(Boolean) ?? []);
        graphCommitId = result.commitId;
        warnings = result.warnings;
        data = { episodeId: result.episodeId, commitId: result.commitId, resolved: result.count - 1 };
        try { await exportEpisodes(scope.run, await store.rows(), graphCommitId); }
        catch (error) { throw new OsgError('STORAGE_UNAVAILABLE', 'Episode committed; export failed. Run export episodes to recover.', { commitId: graphCommitId, cause: String(error) }); }
      }
      if (command === 'context') {
        const stale = async (relative: string, sourceHash: string | null) => {
          try {
            const target = path.resolve(scope.root, relative);
            if (!target.startsWith(scope.root + path.sep) || (await realpath(target)) !== target) return true;
            return createHash('sha256').update(await readFile(target)).digest('hex') !== sourceHash;
          } catch { return true; }
        };
        data = await context(store, options.task ?? options.entity!, Number(options['max-tokens'] ?? 800), stale, options.entity);
        const packet = data as Awaited<ReturnType<typeof context>>;
        const budget = packet.maxTokens * 4;
        const size = () => JSON.stringify({ schemaVersion: 1, requestId, workspaceId, branch, graphCommitId, ok: true,
          data: packet, error: null, warnings }).length;
        while (packet.items.length && size() > budget) packet.items.pop();
        if (size() > budget) throw new OsgError('USAGE', 'Token budget too small for envelope');
        packet.estimatedTokens = Math.ceil(size() / 4);
        while (packet.items.length && size() > budget) {
          packet.items.pop();
          packet.estimatedTokens = Math.ceil(size() / 4);
        }
        if (size() > budget) throw new OsgError('USAGE', 'Token budget too small for envelope');
      }
      if (command === 'history') data = await history(store, options.entity!, options.commit);
      if (command === 'verify') data = verify(await store.rows(), options.commit);
      if (command === 'export') data = await exportEpisodes(scope.run, await store.rows(), graphCommitId!);
    }
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, requestId, workspaceId, branch, graphCommitId, ok: true, data, error: null, warnings })}\n`);
  } catch (cause) {
    const error = cause instanceof OsgError ? cause : new OsgError('INTERNAL', String(cause));
    const exit = exits[error.code] ?? 1;
    process.exitCode = exit;
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, requestId, workspaceId, branch, graphCommitId, ok: false,
      data: null, error: { code: error.code, category: categories[exit], message: error.message, details: error.details, retryable: error.code === 'STALE_HEAD' }, warnings })}\n`);
    console.error(`${error.code}: ${error.message}`);
  }
}

await main();
