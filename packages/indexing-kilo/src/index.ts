import ignore, { type Ignore } from 'ignore';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { OsgError } from '../../contracts/src/index.js';
import { escapeComponent, sourcePath } from '../../core/src/hash.js';
import type { Proposal } from '../../core/src/graph.js';
import { languageOf, parseWithTreeSitter, sourceExtensions, type TsImport } from './treesitter.js';
const append = <K, V>(map: Map<K, V[]>, key: K, value: V) => { const list = map.get(key); if (list) list.push(value); else map.set(key, [value]); };

export interface Scan { facts: Proposal[]; warnings: { code: string; message: string }[]; files: number; }
/** Derived, rebuildable per-file parse results. Never authoritative; the graph is. */
export interface ScanCache { load(): Promise<unknown>; save(value: unknown): Promise<void>; }
export interface ScanOptions { cache?: ScanCache; cochange?: boolean; }

const excluded = new Set(['.osg', '.git', '.spexcode', '.kilocode', '.understand-anything', 'node_modules', 'dist', 'build', 'vendor', '__pycache__', '.venv', 'venv', 'Pods', 'docs/tasks']
  .map((entry) => process.platform === 'win32' ? entry.toLowerCase() : entry));
const allowed = new RegExp(`\\.(?:md|${sourceExtensions.join('|')})$`, 'i');
const tsLike = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;

interface IgnoreScope { directory: string; rules: Ignore; }

function ignored(scopes: IgnoreScope[], relative: string): boolean {
  let result = false;
  for (const scope of scopes) {
    const local = scope.directory ? relative.slice(scope.directory.length + 1) : relative;
    const match = scope.rules.test(local);
    if (match.ignored || match.unignored) result = match.ignored;
  }
  return result;
}

/** Mandatory policy cannot be undone by an ignore-file negation. */
function mandatoryExcluded(relative: string): boolean {
  const comparison = process.platform === 'win32' ? relative.toLowerCase() : relative;
  const name = path.posix.basename(comparison);
  return excluded.has(comparison) || excluded.has(name) || comparison.startsWith('docs/tasks/') ||
    ['credentials.json', 'supersecrets.txt'].includes(name) || /^\.env(?:\.|$)/i.test(name);
}

/** Source suffix policy shared by discovery and current-source readers. */
function supportedSource(relative: string): boolean {
  const comparison = process.platform === 'win32' ? relative.toLowerCase() : relative;
  return allowed.test(relative) && !comparison.endsWith('.d.ts');
}

/** Read ignore rules only after their directory has passed ancestor policy. */
async function ignoreScopes(directory: string, relative: string, inherited: IgnoreScope[]): Promise<IgnoreScope[]> {
  const scopes = [...inherited];
  const ignorePath = path.join(directory, '.gitignore');
  try {
    const stat = await lstat(ignorePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) throw new OsgError('INVALID_SCHEMA', 'Nonregular or linked ignore file rejected');
    scopes.push({ directory: relative, rules: ignore({ ignorecase: process.platform === 'win32' }).add(await readFile(ignorePath, 'utf8')) });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return scopes;
}

/** Resolve one currently eligible source without scanning, hashing or reading its content. */
export async function readableSource(workspace: string, relative: string): Promise<string | null> {
  const parts = relative.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || /[\\:]/.test(part)) || !supportedSource(relative)) return null;
  // Prune mandatory ancestors before even looking for ignore files inside them.
  if (parts.some((_, index) => mandatoryExcluded(parts.slice(0, index + 1).join('/')))) return null;
  const root = await realpath(workspace);
  let directory = root;
  let parent = '';
  let scopes: IgnoreScope[] = [];
  for (const [index, part] of parts.entries()) {
    scopes = await ignoreScopes(directory, parent, scopes);
    const item = parts.slice(0, index + 1).join('/');
    const isDirectory = index < parts.length - 1;
    if (ignored(scopes, item + (isDirectory ? '/' : ''))) return null;
    const target = path.join(directory, part);
    const stat = await lstat(target);
    if (stat.isSymbolicLink() || (isDirectory ? !stat.isDirectory() : !stat.isFile())) return null;
    if (!isDirectory) return target.startsWith(root + path.sep) && await realpath(target) === target ? target : null;
    directory = target;
    parent = item;
  }
  return null;
}

interface Decl { name: string; kind: string; start: number; end: number; signature: string | null; bodyHash: string | null; calls: string[]; }
interface ImportRef { specifier: string; bindings: { local: string; imported: string }[]; mode?: TsImport['mode']; extensions?: string[]; }
interface FileInfo {
  relative: string; sourceHash: string; lines: number; markdown: boolean;
  headings: { id: string; text: string; line: number }[];
  mentions: { heading: string | null; name: string }[];
  decls: Decl[]; imports: ImportRef[]; warnings: { code: string; message: string }[];
  /** Which parser produced the declarations; line-based results are redone once Tree-sitter loads. */
  parser?: 'tree-sitter' | 'lines';
}

function parseMarkdown(relative: string, text: string, fileId: string): Pick<FileInfo, 'headings' | 'mentions' | 'warnings'> {
  const warnings: FileInfo['warnings'] = [];
  const lines = text.split(/\r?\n/);
  const found = new Map<string, { text: string; positions: number[] }>();
  for (const [index, line] of lines.entries()) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const slug = match[2]!.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    const id = `doc:doc:${sourcePath(relative)}#${escapeComponent(slug)}`;
    const entry = found.get(id) ?? { text: match[2]!, positions: [] };
    entry.positions.push(index);
    found.set(id, entry);
  }
  const headings: FileInfo['headings'] = [];
  const unique = new Map<number, string>();
  for (const [id, entry] of found) {
    if (entry.positions.length !== 1) { warnings.push({ code: 'AMBIGUOUS_DECLARATION', message: id }); continue; }
    headings.push({ id, text: entry.text, line: entry.positions[0]! + 1 });
    unique.set(entry.positions[0]!, id);
  }
  // Backticked identifiers attach to the nearest preceding uniquely identified heading, or to the file.
  const mentions: FileInfo['mentions'] = [];
  let current: string | null = null;
  for (const [index, line] of lines.entries()) {
    if (/^#{1,6}\s/.test(line)) current = unique.get(index) ?? null;
    for (const match of line.matchAll(/`([A-Za-z_$][\w$]{2,})(?:\(\))?`/g)) mentions.push({ heading: current ?? fileId, name: match[1]! });
  }
  return { headings, mentions: dedupe(mentions), warnings };
}

function dedupe(mentions: FileInfo['mentions']): FileInfo['mentions'] {
  const seen = new Set<string>();
  return mentions.filter((mention) => { const key = `${mention.heading}|${mention.name}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

/** Fallback line-oriented declaration finder, used only when the Tree-sitter grammars cannot be loaded: top-level names, no imports or calls. */
function parseOther(relative: string, text: string): Pick<FileInfo, 'decls' | 'imports'> {
  const decls: Decl[] = [];
  const lines = text.split(/\r?\n/);
  const extension = path.posix.extname(relative).toLowerCase();
  let owner: string | null = null;
  const add = (name: string, kind: string, line: number) => {
    const last = decls[decls.length - 1];
    if (last && last.end >= line) last.end = Math.max(last.start, line - 1);
    decls.push({ name: escapeComponent(name), kind, start: line, end: lines.length, signature: null, bodyHash: null, calls: [] });
  };
  for (const [index, line] of lines.entries()) {
    const number = index + 1;
    let match: RegExpExecArray | null;
    if (extension === '.py') {
      if ((match = /^class\s+([A-Za-z_]\w*)/.exec(line))) { owner = match[1]!; add(owner, 'class', number); }
      else if ((match = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(line))) { owner = null; add(match[1]!, 'function', number); }
      else if (owner && (match = /^ {2,8}(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(line))) add(`${owner}.${match[1]!}`, 'method', number);
    } else if (extension === '.go') {
      if ((match = /^func\s+\(\s*\w+\s+\*?([A-Za-z_]\w*)\s*\)\s*([A-Za-z_]\w*)\s*\(/.exec(line))) add(`${match[1]!}.${match[2]!}`, 'method', number);
      else if ((match = /^func\s+([A-Za-z_]\w*)\s*[(\[]/.exec(line))) add(match[1]!, 'function', number);
      else if ((match = /^type\s+([A-Za-z_]\w*)\s+(?:struct|interface)\b/.exec(line))) add(match[1]!, 'type', number);
    } else if (extension === '.rs') {
      if ((match = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/.exec(line))) add(match[1]!, 'function', number);
      else if ((match = /^\s*(?:pub(?:\([^)]*\))?\s+)?(struct|enum|trait)\s+([A-Za-z_]\w*)/.exec(line))) add(match[2]!, match[1]!, number);
    } else if (extension === '.java') {
      if ((match = /^\s*(?:(?:public|protected|private|abstract|static|final|sealed)\s+)*(class|interface|enum|record)\s+([A-Za-z_]\w*)/.exec(line))) { owner = match[2]!; add(owner, match[1]!, number); }
      else if (owner && (match = /^\s{2,8}(?:(?:public|protected|private|static|final|abstract|synchronized)\s+)+[\w<>\[\],.? ]+\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*(?:throws[^{]*)?\{/.exec(line))) add(`${owner}.${match[1]!}`, 'method', number);
    }
  }
  return { decls, imports: [] };
}

async function parseFile(relative: string, bytes: Buffer): Promise<FileInfo> {
  const text = bytes.toString('utf8');
  const fileId = `code:file:${sourcePath(relative)}`;
  const base = { relative, sourceHash: createHash('sha256').update(bytes).digest('hex'), lines: text.split(/\r?\n/).length };
  if (relative.toLowerCase().endsWith('.md')) {
    return { ...base, markdown: true, ...parseMarkdown(relative, text, fileId), decls: [], imports: [] };
  }
  const language = languageOf(relative);
  const tree = language ? await parseWithTreeSitter(language, text) : null;
  if (tree) {
    return { ...base, markdown: false, headings: [], mentions: [], parser: 'tree-sitter', decls: tree.decls, imports: tree.imports,
      warnings: tree.recovered ? [{ code: 'PARSE_RECOVERED', message: relative }] : [] };
  }
  return { ...base, markdown: false, headings: [], mentions: [], parser: 'lines', warnings: [], ...parseOther(relative, text) };
}

/** Files that changed together in recent git history. Silent when git is unavailable. */
export async function readCochange(root: string, known: Set<string>): Promise<Map<string, number>> {
  const output = await new Promise<string>((resolve) => {
    execFile('git', ['-c', 'core.quotepath=off', 'log', '-n', '400', '--name-only', '--no-renames', '--pretty=format:%x00'], {
      cwd: root, timeout: 20000, maxBuffer: 1 << 26, env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', GIT_OPTIONAL_LOCKS: '0' }, windowsHide: true
    }, (error, stdout) => resolve(error ? '' : stdout));
  });
  const pairs = new Map<string, number>();
  for (const block of output.split('\0')) {
    const files = [...new Set(block.split('\n').map((line) => line.trim()).filter((line) => known.has(line)))].sort();
    if (files.length < 2 || files.length > 25) continue;
    for (let i = 0; i < files.length; i++) for (let j = i + 1; j < files.length; j++) {
      const key = `${files[i]}\0${files[j]}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
  }
  return pairs;
}

export async function scan(workspace: string, options: ScanOptions = {}): Promise<Scan> {
  const root = await realpath(workspace);
  const warnings: Scan['warnings'] = [];
  const facts: Proposal[] = [];
  const infos: FileInfo[] = [];
  const casePaths = new Set<string>();
  async function walk(directory: string, relative = '', inherited: IgnoreScope[] = []): Promise<void> {
    const scopes = await ignoreScopes(directory, relative, inherited);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const item = relative ? `${relative}/${entry.name}` : entry.name;
      // Mandatory exclusions precede all negations and prune ancestors before their ignore/content reads.
      if (mandatoryExcluded(item) || ignored(scopes, item + (entry.isDirectory() ? '/' : ''))) continue;
      if (entry.isSymbolicLink()) { warnings.push({ code: 'SYMLINK_SKIPPED', message: item }); continue; }
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), item, scopes);
      else if (entry.isFile() && supportedSource(item)) {
        if (casePaths.has(item.toLowerCase())) throw new OsgError('INVALID_SCHEMA', 'Case-colliding source paths');
        casePaths.add(item.toLowerCase());
        const target = path.join(directory, entry.name);
        // Cached parse results cannot attest to their own source path or content.
        const info = await parseFile(item, await readFile(target));
        infos.push(info);
      }
    }
  }
  await walk(root);
  infos.sort((a, b) => a.relative < b.relative ? -1 : 1);
  if (infos.some((info) => info.parser === 'lines')) warnings.push({ code: 'TREE_SITTER_UNAVAILABLE', message: 'Tree-sitter grammars could not be loaded; line-based fallback used.' });
  const codePaths = new Set(infos.filter((file) => tsLike.test(file.relative)).map((file) => file.relative));
  // Only known code suffixes participate in extension substitution.
  function resolveImport(target: string): string | undefined {
    const extension = path.posix.extname(target);
    const substitutions: Record<string, string[]> = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'], '.jsx': ['.tsx', '.ts', '.jsx'],
      '.mjs': ['.mts', '.mjs'], '.cjs': ['.cts', '.cjs'],
      '.ts': ['.ts'], '.tsx': ['.tsx'], '.mts': ['.mts'], '.cts': ['.cts']
    };
    if (extension) {
      const suffixes = substitutions[extension];
      return suffixes?.map((suffix) => target.slice(0, -extension.length) + suffix).find((candidate) => codePaths.has(candidate));
    }
    const suffixes = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
    return [...suffixes.map((suffix) => target + suffix), ...suffixes.map((suffix) => `${target}/index${suffix}`)]
      .find((candidate) => codePaths.has(candidate));
  }
  // Files by language, for module-name imports that Tree-sitter languages use instead of relative paths.
  const filesByExtension = new Map<string, string[]>();
  for (const file of infos) append(filesByExtension, path.posix.extname(file.relative).toLowerCase(), file.relative);
  const unique = (found: string[]): string | undefined => found.length === 1 ? found[0] : undefined;
  function resolveModule(from: string, specifier: string): string | undefined {
    const extension = path.posix.extname(from).toLowerCase();
    const files = filesByExtension.get(extension) ?? [];
    if (extension === '.py') {
      const dots = /^\.*/.exec(specifier)![0].length;
      const parts = specifier.slice(dots).split('.').filter(Boolean);
      const base = parts.join('/');
      if (dots > 0) {
        let directory = path.posix.dirname(from);
        for (let up = 1; up < dots; up++) directory = path.posix.dirname(directory);
        const join = (name: string) => path.posix.normalize(path.posix.join(directory === '.' ? '' : directory, name));
        const candidates = base ? [join(`${base}.py`), join(`${base}/__init__.py`)] : [join('__init__.py')];
        return candidates.find((candidate) => files.includes(candidate));
      }
      const wanted = [`${base}.py`, `${base}/__init__.py`];
      return unique(files.filter((file) => wanted.some((tail) => file === tail || file.endsWith(`/${tail}`))));
    }
    if (extension === '.java' || extension === '.kt' || extension === '.kts') {
      const tail = `${specifier.replace(/\./g, '/')}${extension === '.java' ? '.java' : '.kt'}`;
      return unique((filesByExtension.get(extension === '.kts' ? '.kt' : extension) ?? []).filter((file) => file === tail || file.endsWith(`/${tail}`)));
    }
    if (extension === '.php') {
      const tail = `${specifier.replace(/\\/g, '/')}.php`;
      return unique(files.filter((file) => file === tail || file.endsWith(`/${tail}`)));
    }
    return undefined;
  }
  // Paths written as strings (C includes, Ruby require_relative, Solidity imports): relative to the importing file first, then a unique path suffix.
  const filesByBase = new Map<string, string[]>();
  for (const file of infos) append(filesByBase, path.posix.basename(file.relative), file.relative);
  function resolveFile(from: string, specifier: string, suffixes: string[] = []): string | undefined {
    const variants = ['', ...suffixes];
    const joined = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    for (const suffix of variants) if (filesByBase.get(path.posix.basename(joined + suffix))?.includes(joined + suffix)) return joined + suffix;
    const clean = path.posix.normalize(specifier);
    if (clean.startsWith('..') || path.posix.isAbsolute(clean)) return undefined;
    const found = new Set<string>();
    for (const suffix of variants) for (const file of filesByBase.get(path.posix.basename(clean + suffix)) ?? []) if (file === clean + suffix || file.endsWith(`/${clean}${suffix}`)) found.add(file);
    return found.size === 1 ? [...found][0] : undefined;
  }
  function resolveRustModule(from: string, name: string): string | undefined {
    const files = filesByExtension.get('.rs') ?? [];
    const directory = path.posix.dirname(from);
    const stem = path.posix.basename(from, '.rs');
    const base = ['mod', 'lib', 'main'].includes(stem) ? directory : path.posix.join(directory, stem);
    const join = (tail: string) => path.posix.normalize(base === '.' ? tail : path.posix.join(base, tail));
    return [join(`${name}.rs`), join(`${name}/mod.rs`)].find((candidate) => files.includes(candidate));
  }
  const observation = Date.now() * 1000;
  const make = (element_id: string, kind: string, props: Record<string, unknown>, extent: Proposal['extent'], sourceHash: string | null,
    src: string | null = null, dst: string | null = null, predicate: string | null = null): Proposal => ({
    element_id, kind, op: 'assert', status: 'observed', src, dst, predicate, extent, props, source_hash: sourceHash,
    valid_from: observation, valid_to: null, observed_at: observation
  });
  const edge = (predicate: string, src: string, dst: string, props: Record<string, unknown>): Proposal =>
    make(`code:edge:${predicate}|${src}|${dst}`, predicate, props, null, null, src, dst, predicate);
  // Emitted symbols, per file and by bare name, for call and mention resolution.
  const emitted = new Map<string, { id: string; decl: Decl }[]>();
  const byBareName = new Map<string, string[]>();
  const byQualifiedName = new Map<string, string[]>();
  const byCName = new Map<string, string[]>();
  const cFamily = /\.(?:c|h|cpp|cc|cxx|hpp|hh|hxx)$/i;
  for (const info of infos) {
    const fileId = `code:file:${sourcePath(info.relative)}`;
    const group = new Map<string, Decl[]>();
    for (const decl of info.decls) append(group, decl.name, decl);
    const list: { id: string; decl: Decl }[] = [];
    const lineExtent = (start: number, end: number) => ({ frame_id: fileId, t: null, q: null, ext_min: [start], ext_max: [end] });
    facts.push(make(fileId, 'file', { name: info.relative, path: info.relative }, lineExtent(1, Math.max(1, info.lines)), info.sourceHash));
    warnings.push(...info.warnings);
    for (const heading of info.headings) {
      facts.push(make(heading.id, 'heading', { name: heading.text, path: info.relative }, lineExtent(heading.line, heading.line), info.sourceHash));
    }
    for (const [name, decls] of group) for (const item of decls) {
      const collision = decls.length > 1;
      if (collision && (!item.signature || decls.filter((other) => other.signature === item.signature).length > 1)) {
        warnings.push({ code: 'AMBIGUOUS_DECLARATION', message: `${info.relative}#${name}` }); continue;
      }
      const id = `code:symbol:${sourcePath(info.relative)}#${name}${collision ? `~${item.signature}` : ''}`;
      facts.push(make(id, item.kind, item.bodyHash ? { name, path: info.relative, bodyHash: item.bodyHash } : { name, path: info.relative },
        lineExtent(item.start, item.end), info.sourceHash));
      facts.push(edge('contains', fileId, id, { name, path: info.relative }));
      list.push({ id, decl: item });
      const bare = name.split('.').pop()!;
      append(byBareName, bare, id);
      append(byQualifiedName, name, id);
      if (cFamily.test(info.relative)) append(byCName, bare, id);
    }
    emitted.set(info.relative, list);
  }
  // Imports, calls and documentation mentions are resolved against the emitted symbols only; unresolved or ambiguous names add nothing.
  const seenEdges = new Set<string>();
  const addEdge = (predicate: string, src: string, dst: string, props: Record<string, unknown>) => {
    const id = `code:edge:${predicate}|${src}|${dst}`;
    if (src === dst || seenEdges.has(id)) return;
    seenEdges.add(id); facts.push(edge(predicate, src, dst, props));
  };
  for (const info of infos) {
    const fileId = `code:file:${sourcePath(info.relative)}`;
    const resolvedBindings = new Map<string, { file: string; imported: string }>();
    for (const imported of info.imports) {
      const resolved = imported.mode === 'module' ? resolveModule(info.relative, imported.specifier)
        : imported.mode === 'file' ? resolveFile(info.relative, imported.specifier, imported.extensions)
        : info.relative.endsWith('.rs') ? resolveRustModule(info.relative, imported.specifier)
        : resolveImport(path.posix.normalize(path.posix.join(path.posix.dirname(info.relative), imported.specifier)));
      if (!resolved) continue;
      addEdge('imports', fileId, `code:file:${sourcePath(resolved)}`, { name: imported.specifier, path: info.relative });
      for (const binding of imported.bindings) resolvedBindings.set(binding.local, { file: resolved, imported: binding.imported });
    }
    const own = emitted.get(info.relative) ?? [];
    for (const { id, decl } of own) for (const called of decl.calls) {
      const local = own.filter((other) => other.decl.name === called);
      let target: string | undefined = local.length === 1 ? local[0]!.id : undefined;
      if (!target && local.length === 0) {
        // `Type.member` calls (Java static calls) resolve through the binding of `Type`.
        const dot = called.indexOf('.');
        const binding = resolvedBindings.get(dot < 0 ? called : called.slice(0, dot));
        const wanted = dot < 0 ? binding?.imported : binding ? binding.imported + called.slice(dot) : undefined;
        const candidates = binding ? (emitted.get(binding.file) ?? []).filter((other) => other.decl.name === wanted) : [];
        if (candidates.length === 1) target = candidates[0]!.id;
      }
      // Go packages are directories: a bare call may name a function in a sibling file of the same package.
      if (!target && local.length === 0 && info.relative.endsWith('.go')) {
        const directory = path.posix.dirname(info.relative);
        const siblings = infos.filter((other) => other.relative !== info.relative && other.relative.endsWith('.go') && path.posix.dirname(other.relative) === directory)
          .flatMap((other) => (emitted.get(other.relative) ?? []).filter((candidate) => candidate.decl.name === called));
        if (siblings.length === 1) target = siblings[0]!.id;
      }
      // Static or namespaced `Type.member` calls whose import cannot be followed resolve when the repository has exactly one such member.
      if (!target && local.length === 0 && called.includes('.')) {
        const found = byQualifiedName.get(called);
        if (found?.length === 1) target = found[0];
      }
      // C and C++ share headers and sources without module names: a bare call resolves when exactly one C-family file defines it.
      if (!target && local.length === 0 && !called.includes('.') && cFamily.test(info.relative)) {
        const found = byCName.get(called);
        if (found?.length === 1) target = found[0];
      }
      if (target) addEdge('calls', id, target, { name: called, path: info.relative });
    }
    for (const mention of info.mentions) {
      const targets = byBareName.get(mention.name);
      if (targets?.length === 1) addEdge('mentions', mention.heading!, targets[0]!, { name: mention.name, path: info.relative });
    }
  }
  // Test files link to the single source file whose stem they name.
  const stems = new Map<string, string[]>();
  for (const info of infos) if (tsLike.test(info.relative) && !/\.(?:test|spec)\.[jt]sx?$/i.test(info.relative)) {
    const stem = path.posix.basename(info.relative).replace(/\.[jt]sx?$/i, '');
    append(stems, stem, info.relative);
  }
  for (const info of infos) {
    const match = /^(.+)\.(?:test|spec)\.[jt]sx?$/i.exec(path.posix.basename(info.relative));
    const sources = match ? stems.get(match[1]!) : undefined;
    if (sources?.length === 1) addEdge('tests', `code:file:${sourcePath(info.relative)}`, `code:file:${sourcePath(sources[0]!)}`, { name: 'tests', path: info.relative });
  }
  // Directory nodes give module-level anchors for summaries.
  const directories = new Set<string>();
  for (const info of infos) {
    let directory = path.posix.dirname(info.relative);
    while (directory !== '.' && !directories.has(directory)) { directories.add(directory); directory = path.posix.dirname(directory); }
  }
  for (const directory of [...directories].sort()) {
    const id = `code:dir:${sourcePath(directory)}`;
    facts.push(make(id, 'dir', { name: path.posix.basename(directory), path: directory }, null, null));
    const parent = path.posix.dirname(directory);
    if (parent !== '.') addEdge('contains', `code:dir:${sourcePath(parent)}`, id, { name: path.posix.basename(directory), path: directory });
  }
  for (const info of infos) {
    const directory = path.posix.dirname(info.relative);
    if (directory !== '.') addEdge('contains', `code:dir:${sourcePath(directory)}`, `code:file:${sourcePath(info.relative)}`, { name: path.posix.basename(info.relative), path: directory });
  }
  if (options.cochange) {
    const pairs = await readCochange(root, new Set(infos.map((info) => info.relative)));
    const perFile = new Map<string, number>();
    for (const [key, count] of [...pairs].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) {
      if (count < 3) continue;
      const [a, b] = key.split('\0') as [string, string];
      if ((perFile.get(a) ?? 0) >= 12 || (perFile.get(b) ?? 0) >= 12) continue;
      perFile.set(a, (perFile.get(a) ?? 0) + 1); perFile.set(b, (perFile.get(b) ?? 0) + 1);
      const weight = count >= 20 ? 4 : count >= 10 ? 3 : count >= 5 ? 2 : 1;
      addEdge('cochange', `code:file:${sourcePath(a)}`, `code:file:${sourcePath(b)}`, { name: 'cochange', path: a, weight });
    }
  }
  return { facts, warnings, files: infos.length };
}
