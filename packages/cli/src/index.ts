#!/usr/bin/env node
// Copyright 2026 Vlad Bellomorski
// SPDX-License-Identifier: Apache-2.0

import { randomUUID, createHash } from 'node:crypto';
import { appendFile, cp, link, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat as statFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { OsgError, type GraphPort, type GraphRow } from '../../contracts/src/index.js';
import { diff, history, remember, sync } from '../../core/src/memory.js';
import { context } from '../../core/src/retrieval.js';
import { headView, type StateCache } from '../../core/src/state.js';
import { snapshot, verify } from '../../core/src/graph.js';
import { buildIndex, decodeIndex, embeddableText, encodeIndex, textDigest, type QueryVectors, type VectorIndex, type VectorStorage } from '../../core/src/embedding.js';
import { loadEmbedder } from './embedder.js';

type Warning = { code: string; message: string };
const supported = new Set(['help', 'init', 'sync', 'migrate', 'remember', 'context', 'history', 'verify', 'export', 'diff', 'backup', 'restore', 'doctor', 'stats', 'embed']);
const choices: Record<string, Set<string>> = {
  help: new Set(['json']), migrate: new Set(['workspace', 'dry-run', 'json']), init: new Set(['workspace', 'json']), sync: new Set(['workspace', 'json']),
  remember: new Set(['workspace', 'task', 'decision', 'outcome', 'entities', 'supersedes', 'tags', 'json']),
  context: new Set(['workspace', 'task', 'entity', 'max-tokens', 'at', 'commit', 'with-source', 'json']),
  diff: new Set(['workspace', 'from', 'to', 'json']), backup: new Set(['workspace', 'json']), restore: new Set(['workspace', 'backup', 'json']),
  doctor: new Set(['workspace', 'fix', 'json']), stats: new Set(['workspace', 'json']), embed: new Set(['workspace', 'json']),
  history: new Set(['workspace', 'entity', 'commit', 'json']),
  verify: new Set(['workspace', 'commit', 'json']), export: new Set(['workspace', 'json'])
};
const exits: Record<string, number> = { SWIFT_PARSE_FAILED: 1, USAGE: 2, STALE_HEAD: 3, STATE_CONFLICT: 4, INVALID_DELTA: 5,
  INVALID_SCHEMA: 5, STORAGE_UNAVAILABLE: 6, NOT_INITIALIZED: 6, BRANCH_NOT_FOUND: 7,
  COMMIT_NOT_FOUND: 7, VERIFY_FAILED: 8, UNSUPPORTED_OPERATION: 9, MIGRATION_REQUIRED: 4, UNSUPPORTED_FORMAT: 9, BACKUP_NOT_FOUND: 7 };
const categories: Record<number, string> = { 1: 'internal', 2: 'invalid', 3: 'conflict', 4: 'conflict', 5: 'invalid',
  6: 'storage', 7: 'notFound', 8: 'storage', 9: 'unsupported' };
const safeMessages = new Set([
  'Workspace must be an existing directory', 'Run init first', 'Runtime configuration is missing; run init first',
  'Invalid runtime config JSON', 'Invalid runtime config', 'Runtime path is not a real directory',
  'Runtime symlink rejected', 'Nonregular or linked runtime file rejected', 'Nonregular or linked ignore file rejected',
  'Workspace storage initialized, but ignore-file update failed; release file locks or sharing restrictions and rerun init.',
  'Episode committed; export failed. Run export episodes to recover.',
  'Embeddings need the optional package @huggingface/transformers; see the README section on optional embeddings',
  'Embedding model is not available; run osg embed to download it', 'Unable to load storage adapter',
  'Graph is not initialized', 'Graph has no main head; initialization is incomplete. Preserve the store for recovery.',
  'Invalid main head', 'Invalid head CAS', 'Head changed', 'Invalid token budget',
  'Missing remember fields', 'Missing entity', 'Missing diff range', 'Invalid time', 'Specify exactly one task or entity',
  'Token budget too small for envelope', 'Expected export episodes',
  'Commit selector must be a full ID or a prefix of at least 12 characters',
  'Workspace data format is older than this osg; run migrate (migrate --dry-run shows the plan).',
  'Workspace data format is newer than this osg; upgrade osg.',
  'Backup not found; run restore without --backup to list backups', 'Backup failed verification; nothing was changed',
  'Restore failed; the previous store was put back',
  'Migration failed after a backup was taken; the graph is append-only and still valid. Use restore to return to the newest pre-migrate backup if needed.'
]);
const safeId = /^(?:ROOT|c[0-9a-f]{11,64})$/;

function publicError(error: OsgError): { message: string; details: Record<string, unknown> } {
  const message = safeMessages.has(error.message) ? error.message : {
    USAGE: 'Invalid command arguments', INVALID_SCHEMA: 'Invalid input or stored schema',
    INVALID_DELTA: 'Invalid graph change', VERIFY_FAILED: 'Graph verification failed',
    COMMIT_NOT_FOUND: 'Commit not found', BRANCH_NOT_FOUND: 'Branch not found',
    STATE_CONFLICT: 'Conflicting graph state', STALE_HEAD: 'Head changed',
    SWIFT_PARSE_FAILED: 'Swift extraction failed; scan aborted before committing',
    STORAGE_UNAVAILABLE: 'Storage unavailable', UNSUPPORTED_OPERATION: 'Unsupported command'
  }[error.code] ?? 'Internal error';
  const details: Record<string, unknown> = {};
  for (const key of ['commitId', 'expected', 'actual'] as const) {
    if (typeof error.details[key] === 'string' && safeId.test(error.details[key])) details[key] = error.details[key];
  }
  return { message, details };
}

function publicWarnings(warnings: Warning[]): Warning[] {
  const messages: Record<string, string> = {
    AMBIGUOUS_DECLARATION: 'Ambiguous source declaration skipped',
    SYMLINK_SKIPPED: 'Linked source path skipped',
    UNRESOLVED_ENTITY: 'Entity could not be resolved',
    UNRESOLVED_SUPERSEDES: 'Superseded episode could not be resolved',
    SECRET_REDACTED: 'Credential-like text was removed before saving.',
    PARSE_RECOVERED: 'A source file has syntax errors; declarations were read from the parts that parsed.',
    TREE_SITTER_UNAVAILABLE: 'Tree-sitter grammars could not be loaded; a line-based fallback was used.',
    COCHANGE_UNAVAILABLE: 'Git history was not available for co-change links.',
    POLICY_REFS_UNAVAILABLE: 'Host-loaded rules could not be verified; no rule hash was recorded.',
    VECTORS_UNAVAILABLE: 'The embedding index exists but its model could not be loaded; keyword search was used. Run osg embed.',
    VECTORS_INVALID: 'The embedding cache is incomplete, invalid or outdated; keyword search was used. Run osg embed to rebuild it.'
  };
  return warnings.map(({ code }) => ({ code: Object.hasOwn(messages, code) ? code : 'SOURCE_WARNING',
    message: messages[code] ?? 'Source warning; check the workspace locally.' }));
}

function parse(argv: string[]): { command: string; options: Record<string, string> } {
  const [requested = 'help', ...args] = argv;
  const command = requested === '--help' ? 'help' : requested;
  if (!supported.has(command)) throw new OsgError('UNSUPPORTED_OPERATION', 'Unsupported command');
  const options: Record<string, string> = {};
  if (command === 'export' && args.shift() !== 'episodes') throw new OsgError('USAGE', 'Expected export episodes');
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (!flag.startsWith('--') || !choices[command]!.has(flag.slice(2)) || options[flag.slice(2)] !== undefined) throw new OsgError('USAGE', 'Unknown or repeated argument');
    const name = flag.slice(2);
    if (name === 'json' || name === 'fix' || name === 'with-source' || name === 'dry-run') { options[name] = 'true'; continue; }
    if (!args[index + 1] || args[index + 1]!.startsWith('--')) throw new OsgError('USAGE', 'Missing argument value');
    options[name] = args[++index]!;
  }
  if (command === 'remember' && (!options.task || !options.decision || !options.outcome || !options.entities)) throw new OsgError('USAGE', 'Missing remember fields');
  if (command === 'history' && !options.entity) throw new OsgError('USAGE', 'Missing entity');
  if (command === 'context' && Number(!!options.task) + Number(!!options.entity) !== 1) throw new OsgError('USAGE', 'Specify exactly one task or entity');
  if (command === 'diff' && (!options.from || !options.to)) throw new OsgError('USAGE', 'Missing diff range');
  if (command === 'context' && options.at && (!/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?$/.test(options.at) || Number.isNaN(Date.parse(options.at)))) throw new OsgError('USAGE', 'Invalid time');
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

/** Data format of this workspace. Absent means 1, the format written before migrations existed. */
const currentFormat = 2;

function configInfo(text: string): { workspaceId: string; format: number } {
  let config: unknown;
  try { config = JSON.parse(text) as unknown; }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new OsgError('INVALID_SCHEMA', 'Invalid runtime config JSON');
  }
  if (config === null || typeof config !== 'object' || Array.isArray(config)) throw new OsgError('INVALID_SCHEMA', 'Invalid runtime config');
  const { schemaVersion, workspaceId, format = 1 } = config as Record<string, unknown>;
  if (schemaVersion !== 1 || typeof workspaceId !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(workspaceId) ||
      typeof format !== 'number' || !Number.isInteger(format) || format < 1) {
    throw new OsgError('INVALID_SCHEMA', 'Invalid runtime config');
  }
  return { workspaceId, format };
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
  let format = currentFormat;
  if (create) {
    try {
      await settledConfig(configPath);
      ({ workspaceId, format } = configInfo(await readFile(configPath, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      workspaceId = randomUUID();
      format = currentFormat;
      const temporaryConfig = path.join(run, `config-${randomUUID()}.tmp`);
      try {
        await writeFile(temporaryConfig, JSON.stringify({ schemaVersion: 1, workspaceId, format: currentFormat }), { flag: 'wx' });
        // An exclusive link publishes complete config bytes without replacing another initializer's identity.
        try { await link(temporaryConfig, configPath); }
        catch (cause) {
          if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
          await settledConfig(configPath);
          ({ workspaceId, format } = configInfo(await readFile(configPath, 'utf8')));
        }
      } finally { await rm(temporaryConfig, { force: true }); }
    }
  } else {
    try {
      await settledConfig(configPath);
      ({ workspaceId, format } = configInfo(await readFile(configPath, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      throw new OsgError('NOT_INITIALIZED', 'Runtime configuration is missing; run init first');
    }
  }
  await rejectRuntimeLinks(run);
  return { root, run, storePath, workspaceId, format };
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

/** Derived caches live in .osg/cache; they are rebuilt when missing, damaged or stale. */
function cacheIO(run: string, name: string): StateCache & { path: string; load(): Promise<unknown>; save(value: unknown): Promise<void> } {
  const directory = path.join(run, 'cache');
  const target = path.join(directory, name);
  const io = {
    path: target,
    async read() {
      try { await safeDirectory(directory); await safeFile(target); return JSON.parse(await readFile(target, 'utf8')) as unknown; }
      catch { return null; }
    },
    async write(value: unknown) {
      await safeDirectory(directory, true);
      const temporary = path.join(directory, `${randomUUID()}.tmp`);
      try { await writeFile(temporary, JSON.stringify(value), { flag: 'wx' }); await rename(temporary, target); }
      finally { await rm(temporary, { force: true }); }
    }
  };
  return { ...io, load: () => io.read(), save: (value: unknown) => io.write(value) };
}

/** Optional embedding index: derived, rebuildable files under .osg/cache (never part of the graph). */
function vectorIO(run: string, invalid?: () => void): VectorStorage {
  const directory = path.join(run, 'cache');
  const header = path.join(directory, 'vectors.json');
  const data = path.join(directory, 'vectors.bin');
  return {
    async read() {
      let present = false;
      try {
        await safeDirectory(directory);
        present = (await Promise.all([header, data].map((target) => lstat(target).then(() => true, () => false)))).some(Boolean);
        if (!present) return null;
        await safeFile(header); await safeFile(data);
        const index = decodeIndex(JSON.parse(await readFile(header, 'utf8')) as unknown, await readFile(data));
        if (!index) invalid?.();
        return index;
      } catch { if (present) invalid?.(); return null; }
    },
    async write(index: VectorIndex) {
      await safeDirectory(directory, true);
      const encoded = encodeIndex(index);
      const stage = async (target: string, content: string | Uint8Array) => {
        const temporary = path.join(directory, `${randomUUID()}.tmp`);
        try { await writeFile(temporary, content, { flag: 'wx' }); await rename(temporary, target); }
        finally { await rm(temporary, { force: true }); }
      };
      // Publish owned binary bytes first and the bound header last. Each rename replaces a complete file.
      // A crash or concurrent writer can leave a mixed pair, but readers verify the combined digest before use.
      // Such a pair is only a cache miss (lexical fallback), never partially ranked data or graph damage.
      await stage(data, encoded.data);
      await stage(header, encoded.header);
    }
  };
}

/** Current git branch and revision, read from .git files without running git. */
async function readGit(root: string): Promise<{ branch: string | null; revision: string | null } | null> {
  try {
    const gitDirectory = path.join(root, '.git');
    const stat = await lstat(gitDirectory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
    const head = (await readFile(path.join(gitDirectory, 'HEAD'), 'utf8')).trim();
    const ref = /^ref: (refs\/heads\/[\w./-]+)$/.exec(head);
    if (!ref) return /^[0-9a-f]{40,64}$/.test(head) ? { branch: null, revision: head } : null;
    let revision: string | null = null;
    try { revision = (await readFile(path.join(gitDirectory, ref[1]!), 'utf8')).trim(); }
    catch {
      const packed = await readFile(path.join(gitDirectory, 'packed-refs'), 'utf8').catch(() => '');
      revision = packed.split(/\r?\n/).map((line) => line.split(' ')).find((parts) => parts[1] === ref[1])?.[0] ?? null;
    }
    return { branch: ref[1]!.slice('refs/heads/'.length), revision: revision && /^[0-9a-f]{40,64}$/.test(revision) ? revision : null };
  } catch { return null; }
}

const writes = (command: string, options: Record<string, string>) =>
  ['init', 'sync', 'migrate', 'remember', 'export', 'backup', 'embed'].includes(command) || (command === 'doctor' && options.fix === 'true') || (command === 'restore' && options.backup !== undefined);

async function logUsage(run: string, entry: Record<string, unknown>): Promise<void> {
  try {
    const directory = path.join(run, 'logs');
    await safeDirectory(directory, true);
    const target = path.join(directory, 'usage.jsonl');
    try { if ((await statFile(target)).size > 1_000_000) await rename(target, path.join(directory, 'usage.1.jsonl')); } catch { /* absent */ }
    await appendFile(target, `${JSON.stringify(entry)}\n`);
  } catch { /* usage telemetry is best effort and local only */ }
}

async function usageStats(run: string) {
  const lines: Record<string, unknown>[] = [];
  for (const name of ['usage.1.jsonl', 'usage.jsonl']) {
    try { for (const line of (await readFile(path.join(run, 'logs', name), 'utf8')).split('\n')) if (line) lines.push(JSON.parse(line) as Record<string, unknown>); } catch { /* none */ }
  }
  const counts: Record<string, number> = {};
  const recent: Record<string, number> = {};
  const cutoff = Date.now() - 7 * 86_400_000;
  let lastSync: number | null = null, lastRemember: number | null = null;
  for (const entry of lines) {
    const command = String(entry.command);
    counts[command] = (counts[command] ?? 0) + 1;
    if (Number(entry.t) >= cutoff) recent[command] = (recent[command] ?? 0) + 1;
    if (entry.ok && command === 'sync') lastSync = Number(entry.t);
    if (entry.ok && command === 'remember') lastRemember = Number(entry.t);
  }
  const iso = (value: number | null) => value === null ? null : new Date(value).toISOString();
  // Only commands that write are logged: reads are pure (R15), so read usage is not recorded.
  return { loggedCalls: lines.length, byCommand: counts, last7Days: recent, lastSync: iso(lastSync), lastRemember: iso(lastRemember) };
}


/** Written next to each backup so a restore knows the data format and what it holds. */
interface BackupMeta { schemaVersion: 1; createdAt: string; format: number; head: string | null; commits: number | null; elements: number | null; verified: boolean; }
const backupName = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-pre-migrate|-pre-restore)?$/;
/** Labelled backups are safety copies taken before a migration or restore and are never pruned. */
const labelled = (name: string) => name.endsWith('-pre-migrate') || name.endsWith('-pre-restore');

/** Copy of the store and episode export under `.osg/backup`. Verified first when a store handle is given; only unlabelled backups are pruned (last 5). */
async function makeBackup(run: string, storePath: string, store: GraphPort | null, label: string, format: number) {
  const checked = store ? verify(await store.rows()) : null;
  const backups = path.join(run, 'backup');
  await safeDirectory(backups, true);
  const createdAt = new Date().toISOString();
  const stamp = createdAt.replace(/[:.]/g, '-') + label;
  const destination = path.join(backups, stamp);
  await cp(storePath, path.join(destination, 'store'), { recursive: true, errorOnExist: true, force: false });
  try { await cp(path.join(run, 'export'), path.join(destination, 'export'), { recursive: true }); } catch { /* no export yet */ }
  const meta: BackupMeta = { schemaVersion: 1, createdAt, format, head: store ? await store.head('main') : null,
    commits: checked?.commits ?? null, elements: checked?.elements ?? null, verified: checked !== null };
  await writeFile(path.join(destination, 'meta.json'), JSON.stringify(meta));
  const existing = (await readdir(backups, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !labelled(entry.name)).map((entry) => entry.name).sort();
  for (const old of existing.slice(0, Math.max(0, existing.length - 5))) await rm(path.join(backups, old), { recursive: true, force: true });
  return { path: `.osg/backup/${stamp}`, commits: checked?.commits ?? null, elements: checked?.elements ?? null, verified: checked !== null, kept: Math.min(5, existing.length) };
}

async function readBackupMeta(directory: string): Promise<BackupMeta | null> {
  try {
    const meta = JSON.parse(await readFile(path.join(directory, 'meta.json'), 'utf8')) as Partial<BackupMeta>;
    const count = (value: unknown) => value === null || Number.isInteger(value);
    if (meta.schemaVersion !== 1 || typeof meta.createdAt !== 'string' || !Number.isInteger(meta.format) || meta.format! < 1 || typeof meta.verified !== 'boolean' ||
        !(meta.head === null || typeof meta.head === 'string' && /^(?:ROOT|c[0-9a-f]{64})$/.test(meta.head)) || !count(meta.commits) || !count(meta.elements)) return null;
    return meta as BackupMeta;
  } catch { return null; }
}

/** Backups newest first. Older backups without `meta.json` are listed with unknown details and restored as format 1. */
async function listBackups(run: string) {
  const directory = path.join(run, 'backup');
  let entries: string[];
  try { entries = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory() && backupName.test(entry.name)).map((entry) => entry.name); }
  catch { return []; }
  const out = [];
  for (const name of entries.sort().reverse()) {
    const meta = await readBackupMeta(path.join(directory, name));
    const label = /-(pre-migrate|pre-restore)$/.exec(name)?.[1] ?? null;
    out.push({ name, label, createdAt: meta?.createdAt ?? `${name.slice(0, 10)}T${name.slice(11, 13)}:${name.slice(14, 16)}:${name.slice(17, 19)}.${name.slice(20, 23)}Z`,
      format: meta?.format ?? null, commits: meta?.commits ?? null, elements: meta?.elements ?? null, verified: meta?.verified ?? null });
  }
  return out;
}

/**
 * Replace the store with a backup. The backup is copied aside and verified first, the current store is backed up as `*-pre-restore`
 * (copied unverified if it cannot be read), then swapped in by rename and verified again; any failure puts the previous store back.
 */
async function restoreBackup(scope: { root: string; run: string; storePath: string; format: number }, name: string,
  storage: typeof import('../../storage-lance/src/index.js')) {
  if (!backupName.test(name)) throw new OsgError('BACKUP_NOT_FOUND', 'Backup not found; run restore without --backup to list backups');
  const source = path.join(scope.run, 'backup', name);
  try {
    const stat = await lstat(path.join(source, 'store'));
    if (!stat.isDirectory() || stat.isSymbolicLink() || !(await lstat(source)).isDirectory()) throw new Error('not a backup');
  } catch { throw new OsgError('BACKUP_NOT_FOUND', 'Backup not found; run restore without --backup to list backups'); }
  await rejectRuntimeLinks(source);
  const meta = await readBackupMeta(source);
  const format = meta?.format ?? 1;
  if (format > currentFormat) throw new OsgError('UNSUPPORTED_FORMAT', 'Workspace data format is newer than this osg; upgrade osg.');
  const staging = path.join(scope.run, `store-restore-${randomUUID()}`);
  try {
    await cp(path.join(source, 'store'), staging, { recursive: true, errorOnExist: true, force: false });
    let staged: GraphPort | undefined;
    try { staged = await storage.openStore(staging, false); verify(await staged.rows()); }
    catch { throw new OsgError('VERIFY_FAILED', 'Backup failed verification; nothing was changed'); }
    finally { staged?.close?.(); }
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
  let previous: Awaited<ReturnType<typeof makeBackup>>;
  try {
    const current = await storage.openStore(scope.storePath, false);
    try { previous = await makeBackup(scope.run, scope.storePath, current, '-pre-restore', scope.format); }
    finally { current.close?.(); }
  } catch {
    // The current store may be the reason for restoring: keep an unverified copy rather than refuse.
    try { previous = await makeBackup(scope.run, scope.storePath, null, '-pre-restore', scope.format); }
    catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
  }
  const aside = path.join(scope.run, `store-replaced-${randomUUID()}`);
  await rename(scope.storePath, aside);
  let opened: GraphPort | undefined;
  try {
    await rename(staging, scope.storePath);
    opened = await storage.openStore(scope.storePath, false);
    const checked = verify(await opened.rows());
    const head = await opened.head('main');
    for (const file of ['state.json', 'scan.json']) await rm(path.join(scope.run, 'cache', file), { force: true });
    await exportEpisodes(scope.run, opened, head!);
    if (format !== scope.format) await writeFormat(scope.run, format);
    opened.close?.();
    await rm(aside, { recursive: true, force: true });
    return { head, data: { restored: `.osg/backup/${name}`, head, commits: checked.commits, elements: checked.elements, format,
      migrationRequired: format < currentFormat, previousStore: previous.path, previousStoreVerified: previous.verified } };
  } catch {
    opened?.close?.();
    await rm(scope.storePath, { recursive: true, force: true });
    await rm(staging, { recursive: true, force: true });
    await rename(aside, scope.storePath);
    if (format !== scope.format) await writeFormat(scope.run, scope.format).catch(() => undefined);
    throw new OsgError('STORAGE_UNAVAILABLE', 'Restore failed; the previous store was put back');
  }
}

/** Replace the data format in `.osg/config.json` atomically, keeping every other field. */
async function writeFormat(run: string, format: number): Promise<void> {
  const target = path.join(run, 'config.json');
  await safeFile(target);
  const config = JSON.parse(await readFile(target, 'utf8')) as Record<string, unknown>;
  const temporary = path.join(run, `config-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify({ ...config, format }), { flag: 'wx' });
    await rename(temporary, target);
  } catch (error) { await rm(temporary, { force: true }); throw error; }
}

interface Migration { from: number; to: number; id: string; describe: string; }
/** Ordered data migrations. Each runs through the normal append-only commit path; nothing is rewritten in place. */
const migrations: Migration[] = [
  { from: 1, to: 2, id: 'tree-sitter-identities',
    describe: 'Re-index Python, Go, Rust and Java with Tree-sitter and carry episode links from line-parser symbol identities to the new ones.' }
];

async function exportEpisodes(run: string, store: GraphPort, head: string) {
  const exported = path.join(run, 'export');
  await safeDirectory(exported, true);
  const target = path.join(exported, 'episodes.jsonl');
  try { await safeFile(target); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const rows = [...await store.commitRows(), ...await store.rowsOfKind('episode')];
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

// The public launcher receives results separately from native stdout/stderr.
async function emit(packet: unknown): Promise<void> {
  if (process.send) {
    await new Promise<void>((resolve, reject) => process.send!(packet as object, undefined, undefined, (error: Error | null) => error ? reject(error) : resolve()));
    process.disconnect();
  } else process.stdout.write(`${JSON.stringify(packet)}\n`);
}

async function main() {
  // Direct backend callers retain JS redaction; public callers also isolate native fd writes.
  const writeDiagnostic = process.stderr.write.bind(process.stderr);
  let externalDiagnosticReported = false;
  process.stderr.write = ((...args: Parameters<typeof process.stderr.write>) => {
    if (!externalDiagnosticReported) {
      externalDiagnosticReported = true;
      writeDiagnostic('EXTERNAL_DIAGNOSTIC_REDACTED: Inspect the JSON result; raw third-party output was omitted.\n');
    }
    const callback = args.find((value) => typeof value === 'function');
    if (callback) callback();
    return true;
  }) as typeof process.stderr.write;
  const requestId = randomUUID();
  let workspaceId: string | null = null;
  let branch: string | null = null;
  let graphCommitId: string | null = null;
  let warnings: Warning[] = [];
  let runDir: string | null = null;
  const started = Date.now();
  let commandName = 'unknown';
  let commandOptions: Record<string, string> = {};
  try {
    const { command, options } = parse(process.argv.slice(2));
    commandName = command;
    commandOptions = options;
    let data: unknown;
    if (command === 'help') data = { commands: [...supported].sort(), provider: 'tree-sitter-wasm@0.3.1', unsupported: ['approve', 'watch', 'query', 'scan', 'status', 'branch', 'graph', 'propose', 'commit', 'maintain', 'vectors', 'server'] };
    else {
      const scope = await runtime(options.workspace ?? process.cwd(), command === 'init');
      workspaceId = scope.workspaceId;
      runDir = scope.run;
      if (scope.format > currentFormat) throw new OsgError('UNSUPPORTED_FORMAT', 'Workspace data format is newer than this osg; upgrade osg.');
      if (command === 'sync' && scope.format < currentFormat) throw new OsgError('MIGRATION_REQUIRED', 'Workspace data format is older than this osg; run migrate (migrate --dry-run shows the plan).');
      branch = 'main';
      let storage: typeof import('../../storage-lance/src/index.js');
      try { storage = await import('../../storage-lance/src/index.js'); }
      catch { throw new OsgError('STORAGE_UNAVAILABLE', 'Unable to load storage adapter'); }
      if (command === 'restore') {
        if (options.backup === undefined) data = { backups: await listBackups(scope.run) };
        else { const restored = await restoreBackup(scope, options.backup, storage); graphCommitId = restored.head; data = restored.data; }
      } else {
      const store = await storage.openStore(scope.storePath, command === 'init');
      graphCommitId = await store.head('main');
      if (command === 'init') data = { initialized: true, noop: graphCommitId !== 'ROOT', ignoreUpdated: await ensureIgnored(scope.root) };
      const stateCache = cacheIO(scope.run, 'state.json');
      // Read commands never write caches; only sync and remember refresh them.
      const readOnlyState = { read: () => stateCache.read(), write: async () => undefined };
      const scanCache = cacheIO(scope.run, 'scan.json');
      const git = await readGit(scope.root);
      if (command === 'migrate') {
        const pending = migrations.filter((step) => step.from >= scope.format && step.to <= currentFormat);
        const readOnlyScan = { load: () => scanCache.load(), save: async () => undefined };
        const extract = async () => (await import('../../indexing-kilo/src/index.js')).scan(scope.root, { cache: options['dry-run'] ? readOnlyScan : scanCache, cochange: git !== null });
        if (!pending.length) data = { migrated: false, format: scope.format, pending: [] };
        else if (options['dry-run']) {
          const plan = await sync(store, extract, { cache: readOnlyState, dryRun: true });
          warnings = plan.warnings;
          data = { migrated: false, dryRun: true, fromFormat: scope.format, toFormat: currentFormat, pending: pending.map(({ id, describe }) => ({ id, describe })),
            plan: { filesScanned: plan.files, symbolsToAdd: plan.added, symbolsToRetire: plan.retired, episodeLinksToCarryOver: plan.renamed } };
        } else {
          verify(await store.rows());
          const backup = await makeBackup(scope.run, scope.storePath, store, '-pre-migrate', scope.format);
          try {
            const result = await sync(store, extract, { cache: stateCache });
            warnings = result.warnings;
            graphCommitId = result.commitId;
            verify(await store.rows());
            await headView(store, stateCache);
            await writeFormat(scope.run, currentFormat);
            data = { migrated: true, fromFormat: scope.format, toFormat: currentFormat, applied: pending.map(({ id }) => id), commitId: result.commitId,
              changes: result.count, episodeLinksCarriedOver: result.renamed, backup: backup.path };
          } catch (error) {
            if (error instanceof OsgError && error.code === 'STALE_HEAD') throw error;
            throw new OsgError('STORAGE_UNAVAILABLE', 'Migration failed after a backup was taken; the graph is append-only and still valid. Use restore to return to the newest pre-migrate backup if needed.');
          }
        }
      }
      if (command === 'sync') {
        const result = await sync(store, async () => (await import('../../indexing-kilo/src/index.js')).scan(scope.root, { cache: scanCache, cochange: git !== null }),
          { cache: stateCache });
        // The first commit has no cache to extend; seed it once so later runs start warm.
        if (graphCommitId === 'ROOT' && result.commitId !== 'ROOT') await headView(store, stateCache).catch(() => undefined);
        graphCommitId = result.commitId;
        warnings = result.warnings;
        data = { commitId: result.commitId, noop: result.noop, idempotent: result.idempotent, changes: result.count, files: result.files, renamed: result.renamed };
      }
      if (command === 'remember') {
        const result = await remember(store, options.task!, options.decision!, options.outcome!, options.entities?.split(',').filter(Boolean) ?? [], {
          supersedes: options.supersedes?.split(',').filter(Boolean) ?? [], tags: options.tags?.split(',').filter(Boolean) ?? [], cache: stateCache, git });
        graphCommitId = result.commitId;
        warnings = result.warnings;
        data = { episodeId: result.episodeId, commitId: result.commitId, resolved: result.linked };
        try { await exportEpisodes(scope.run, store, graphCommitId); }
        catch { throw new OsgError('STORAGE_UNAVAILABLE', 'Episode committed; export failed. Run export episodes to recover.', { commitId: graphCommitId }); }
      }
      if (command === 'context') {
        const { readableSource } = await import('../../indexing-kilo/src/index.js');
        const readable = (relative: string) => readableSource(scope.root, relative);
        const stale = async (relative: string, sourceHash: string | null) => {
          try {
            const target = await readable(relative);
            return target === null || createHash('sha256').update(await readFile(target)).digest('hex') !== sourceHash;
          } catch { return true; }
        };
        const source = async (relative: string, startLine: number, endLine: number) => {
          try {
            const target = await readable(relative);
            if (target === null) return null;
            return (await readFile(target, 'utf8')).split(/\r?\n/).slice(startLine - 1, endLine).map((line) => line.slice(0, 160)).join('\n');
          } catch { return null; }
        };
        // Meaning-based candidates only when an index exists; the model is loaded from disk and never downloaded here.
        let vectors: QueryVectors | undefined;
        let closeEmbedder: (() => Promise<void>) | null = null;
        const index = options.task ? await vectorIO(scope.run, () => warnings.push({ code: 'VECTORS_INVALID', message: '' })).read() : null;
        if (index) {
          let loaded: Awaited<ReturnType<typeof loadEmbedder>> | null = null;
          vectors = { index, embedQuery: async (text) => {
            try {
              loaded ??= await loadEmbedder(path.join(scope.run, 'cache', 'models'), false);
              if (loaded.id !== index.model) throw new OsgError('UNSUPPORTED_OPERATION', 'Embedding model differs from the index');
              closeEmbedder = () => loaded!.close();
              return (await loaded.embed([text]))[0] ?? null;
            } catch { warnings.push({ code: 'VECTORS_UNAVAILABLE', message: '' }); return null; }
          } };
        }
        try {
          data = await context(store, options.task ?? options.entity!, Number(options['max-tokens'] ?? 800), stale, options.entity, {
            cache: readOnlyState, atCommit: options.commit, atTime: options.at ? Date.parse(options.at) * 1000 : undefined,
            source: options['with-source'] ? source : undefined, currentBranch: git?.branch ?? null, vectors });
        } finally { await (closeEmbedder as (() => Promise<void>) | null)?.().catch(() => undefined); }
        const packet = data as Awaited<ReturnType<typeof context>>;
        const budget = packet.maxTokens * 4;
        const size = () => JSON.stringify({ schemaVersion: 1, requestId, workspaceId, branch, graphCommitId, ok: true,
          data: packet, error: null, warnings: publicWarnings(warnings) }).length;
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
      if (command === 'diff') data = await diff(store, options.from!, options.to!);
      if (command === 'verify') data = verify(await store.rows(), options.commit);
      if (command === 'export') data = await exportEpisodes(scope.run, store, graphCommitId!);
      if (command === 'stats') {
        const view = await headView(store, readOnlyState);
        data = { ...(await usageStats(scope.run)), elements: view.state.size, episodes: [...view.state.values()].filter((row) => row.kind === 'episode').length,
          commits: view.commits.size, format: scope.format, git: git ? { branch: git.branch, revision: git.revision?.slice(0, 12) ?? null } : null };
      }
      if (command === 'embed') {
        // Writes only derived files under .osg/cache. The graph, its hashes and `verify` are untouched.
        const view = await headView(store, readOnlyState);
        const modelDirectory = path.join(scope.run, 'cache', 'models');
        await safeDirectory(path.join(scope.run, 'cache'), true);
        await safeDirectory(modelDirectory, true);
        const embedder = await loadEmbedder(modelDirectory, true);
        try {
          const vectors = vectorIO(scope.run);
          // Stop starting batches after 70 s so model loading and the write fit in the 120 s command deadline; run again to continue.
          const { index, report } = await buildIndex(view.state, embedder, await vectors.read(), { deadlineMs: 70_000 });
          await vectors.write(index);
          data = { model: embedder.id, ...report, complete: report.remaining === 0 };
        } finally { await embedder.close(); }
      }
      if (command === 'backup') data = await makeBackup(scope.run, scope.storePath, store, '', scope.format);
      if (command === 'doctor') {
        const checks: { name: string; ok: boolean; detail: string }[] = [];
        const rows = await store.rows();
        try { const v = verify(rows); checks.push({ name: 'graph verification', ok: true, detail: `${v.commits} commits, ${v.elements} elements` }); }
        catch { checks.push({ name: 'graph verification', ok: false, detail: 'verification failed; restore the latest backup or export and rebuild' }); }
        const head = await store.head('main');
        const authoritative = head && head !== 'ROOT' ? snapshot(rows, head).state : new Map();
        const cached = await stateCache.read() as { head?: string; rows?: GraphRow[] } | null;
        // A cache written for an older head is harmless: nothing reads it as evidence. Only a cache claiming the current head can be wrong.
        const cacheOlder = cached !== null && typeof cached.head === 'string' && cached.head !== head;
        const cacheOk = cached === null || cacheOlder || (cached.head === head && Array.isArray(cached.rows) &&
          cached.rows.length === authoritative.size && new Set(cached.rows.map((row) => row?.element_id)).size === authoritative.size &&
          cached.rows.every((row) => row && JSON.stringify(authoritative.get(row.element_id)) === JSON.stringify(row)));
        checks.push({ name: 'data format', ok: scope.format === currentFormat, detail: scope.format === currentFormat ? `format ${scope.format}` : `format ${scope.format}, current is ${currentFormat}; run migrate --dry-run` });
        checks.push({ name: 'state cache', ok: cacheOk, detail: cached ? (cacheOlder ? 'older than the graph; not used' : cacheOk ? 'matches the graph' : 'differs from the graph; run doctor --fix') : 'absent (rebuilt on demand)' });
        const vectorIndex = await vectorIO(scope.run).read();
        if (vectorIndex) {
          const current = new Map<string, string>();
          for (const [id, row] of authoritative) { const text = embeddableText(row); if (text !== null) current.set(id, textDigest(text)); }
          const covered = vectorIndex.keys.filter((key, i) => current.get(key) === vectorIndex.hashes[i]).length;
          checks.push({ name: 'embeddings', ok: true, detail: `${covered} of ${current.size} searchable elements have current vectors${covered < current.size ? '; run osg embed to add the rest' : ''}` });
        }
        let exportedCount: number | null = null;
        try { exportedCount = (await readFile(path.join(scope.run, 'export', 'episodes.jsonl'), 'utf8')).split('\n').filter(Boolean).length; } catch { /* none */ }
        const episodes = [...authoritative.values()].filter((row) => row.kind === 'episode').length;
        checks.push({ name: 'episode export', ok: exportedCount === null || exportedCount >= episodes, detail: exportedCount === null ? 'absent' : `${exportedCount} exported, ${episodes} live episodes` });
        if (options.fix) {
          for (const name of ['state.json', 'scan.json']) await rm(path.join(scope.run, 'cache', name), { force: true });
          if (exportedCount !== null && exportedCount < episodes) await exportEpisodes(scope.run, store, head!);
        }
        data = { ok: checks.every((check) => check.ok), fixed: options.fix === 'true', checks };
      }
      }
    }
    if (runDir && writes(command, options)) await logUsage(runDir, { t: Date.now(), command, ok: true, ms: Date.now() - started });
    await emit({ schemaVersion: 1, requestId, workspaceId, branch, graphCommitId, ok: true, data, error: null, warnings: publicWarnings(warnings) });
  } catch (cause) {
    const error = cause instanceof OsgError ? cause : new OsgError('INTERNAL', 'Internal error');
    const exit = exits[error.code] ?? 1;
    if (runDir && writes(commandName, commandOptions)) await logUsage(runDir, { t: Date.now(), command: commandName, ok: false, code: error.code, ms: Date.now() - started });
    process.exitCode = exit;
    const safe = publicError(error);
    await emit({ schemaVersion: 1, requestId, workspaceId, branch, graphCommitId, ok: false,
      data: null, error: { code: error.code, category: categories[exit], ...safe, retryable: error.code === 'STALE_HEAD' }, warnings: publicWarnings(warnings) });
    writeDiagnostic(`${error.code}: ${safe.message}\n`);
  }
}

await main();
