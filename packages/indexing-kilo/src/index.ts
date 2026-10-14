import ts from 'typescript';
import ignore, { type Ignore } from 'ignore';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { OsgError } from '../../contracts/src/index.js';
import { escapeComponent, hash, sourcePath } from '../../core/src/hash.js';
import type { Proposal } from '../../core/src/graph.js';

export interface Scan { facts: Proposal[]; warnings: { code: string; message: string }[]; files: number; }
const excluded = new Set(['.osg', '.git', '.spexcode', '.kilocode', '.understand-anything', 'node_modules', 'dist', 'build', 'docs/tasks']);
const allowed = /\.(ts|tsx|js|jsx|md)$/i;

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

export async function scan(workspace: string): Promise<Scan> {
  const root = await realpath(workspace);
  const warnings: Scan['warnings'] = [];
  const facts: Proposal[] = [];
  const found: { relative: string; bytes: Buffer }[] = [];
  const casePaths = new Set<string>();
  async function walk(directory: string, relative = '', inherited: IgnoreScope[] = []): Promise<void> {
    const scopes = [...inherited];
    const ignorePath = path.join(directory, '.gitignore');
    try {
      const stat = await lstat(ignorePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) throw new OsgError('INVALID_SCHEMA', 'Nonregular or linked ignore file rejected');
      scopes.push({ directory: relative, rules: ignore({ ignorecase: process.platform === 'win32' }).add(await readFile(ignorePath, 'utf8')) });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const item = relative ? `${relative}/${entry.name}` : entry.name;
      // Fold filesystem comparisons only; original paths still determine identities and hashes.
      const comparisonPath = process.platform === 'win32' ? item.toLowerCase() : item;
      const comparisonName = process.platform === 'win32' ? entry.name.toLowerCase() : entry.name;
      // Mandatory exclusions precede all negations and prune ancestors before their ignore/content reads.
      if (excluded.has(comparisonPath) || excluded.has(comparisonName) || comparisonPath.startsWith('docs/tasks/') ||
          ['credentials.json', 'supersecrets.txt'].includes(comparisonName) || /^\.env(?:\.|$)/i.test(comparisonName) ||
          ignored(scopes, item + (entry.isDirectory() ? '/' : ''))) continue;
      if (entry.isSymbolicLink()) { warnings.push({ code: 'SYMLINK_SKIPPED', message: item }); continue; }
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), item, scopes);
      else if (entry.isFile() && allowed.test(item) && !comparisonPath.endsWith('.d.ts')) {
        if (casePaths.has(item.toLowerCase())) throw new OsgError('INVALID_SCHEMA', 'Case-colliding source paths');
        casePaths.add(item.toLowerCase());
        found.push({ relative: item, bytes: await readFile(path.join(directory, entry.name)) });
      }
    }
  }
  await walk(root);
  const codePaths = new Set(found.filter((file) => /\.(ts|tsx|js|jsx)$/i.test(file.relative)).map((file) => file.relative));
  // Only known code suffixes participate in extension substitution.
  function resolveImport(target: string): string | undefined {
    const extension = path.posix.extname(target);
    const substitutions: Record<string, string[]> = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'], '.jsx': ['.tsx', '.ts', '.jsx'],
      '.ts': ['.ts'], '.tsx': ['.tsx']
    };
    if (extension) {
      const suffixes = substitutions[extension];
      return suffixes?.map((suffix) => target.slice(0, -extension.length) + suffix).find((candidate) => codePaths.has(candidate));
    }
    const suffixes = ['.ts', '.tsx', '.js', '.jsx'];
    return [...suffixes.map((suffix) => target + suffix), ...suffixes.map((suffix) => `${target}/index${suffix}`)]
      .find((candidate) => codePaths.has(candidate));
  }
  const observation = Date.now() * 1000;
  for (const { relative, bytes } of found.sort((a, b) => a.relative < b.relative ? -1 : 1)) {
    const fileId = `code:file:${sourcePath(relative)}`;
    const sourceHash = createHash('sha256').update(bytes).digest('hex');
    const text = bytes.toString('utf8');
    const lines = text.split(/\r?\n/).length;
    const create = (element_id: string, kind: string, name: string, start: number, end: number,
      src: string | null = null, dst: string | null = null, predicate: string | null = null): Proposal => ({
      element_id, kind, op: 'assert', status: 'observed', src, dst, predicate,
      extent: src ? null : { frame_id: fileId, t: null, q: null, ext_min: [start], ext_max: [end] },
      props: { name, path: relative }, source_hash: sourceHash,
      valid_from: observation, valid_to: null, observed_at: observation
    });
    facts.push(create(fileId, 'file', relative, 1, Math.max(1, lines)));
    if (relative.endsWith('.md')) {
      const headings = new Map<string, number[]>();
      for (const [index, line] of text.split(/\r?\n/).entries()) {
        const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
        if (!match) continue;
        const slug = match[2]!.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
        const id = `doc:doc:${sourcePath(relative)}#${escapeComponent(slug)}`;
        headings.set(id, [...headings.get(id) ?? [], index]);
      }
      for (const [id, positions] of headings) {
        if (positions.length !== 1) { warnings.push({ code: 'AMBIGUOUS_DECLARATION', message: id }); continue; }
        const index = positions[0]!;
        const match = /^(#{1,6})\s+(.+?)\s*$/.exec(text.split(/\r?\n/)[index]!)!;
        facts.push(create(id, 'heading', match[2]!, index + 1, index + 1));
      }
      continue;
    }
    const script = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true,
      /\.tsx?$/i.test(relative) ? ts.ScriptKind.TS : ts.ScriptKind.JS);
    const candidates: { name: string; kind: string; start: number; end: number; signature: string | null }[] = [];
    const importEdges = new Set<string>();
    function visit(node: ts.Node, scope: string[] = []): void {
      const declaration = ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) ||
        ts.isMethodDeclaration(node) || ts.isVariableDeclaration(node);
      let next = scope;
      if (declaration && node.name && ts.isIdentifier(node.name)) {
        const name = node.name.text;
        const qualified = [...scope, name].map(escapeComponent).join('.');
        const start = script.getLineAndCharacterOfPosition(node.getStart(script)).line + 1;
        const end = script.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
        const signature = (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))
          ? hash(node.parameters.map((parameter) => parameter.type?.getText(script).replace(/\s+/g, '') ?? '?')).slice(0, 8) : null;
        candidates.push({ name: qualified, kind: ts.SyntaxKind[node.kind]!.replace(/Declaration$/, '').toLowerCase(), start, end, signature });
        if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) next = [...scope, name];
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        if (specifier.startsWith('.')) {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
          const resolved = resolveImport(target);
          if (resolved) {
            const destination = `code:file:${sourcePath(resolved)}`;
            const id = `code:edge:imports|${fileId}|${destination}`;
            if (!importEdges.has(id)) {
              importEdges.add(id);
              facts.push(create(id, 'imports', specifier, 1, 1, fileId, destination, 'imports'));
            }
          }
        }
      }
      ts.forEachChild(node, (child) => visit(child, next));
    }
    visit(script);
    const groups = new Map<string, typeof candidates>();
    for (const item of candidates) groups.set(item.name, [...groups.get(item.name) ?? [], item]);
    for (const [name, group] of groups) for (const item of group) {
      const collision = group.length > 1;
      if (collision && (!item.signature || group.filter((other) => other.signature === item.signature).length > 1)) {
        warnings.push({ code: 'AMBIGUOUS_DECLARATION', message: `${relative}#${name}` }); continue;
      }
      const id = `code:symbol:${sourcePath(relative)}#${name}${collision ? `~${item.signature}` : ''}`;
      facts.push(create(id, item.kind, name, item.start, item.end));
      const edge = `code:edge:contains|${fileId}|${id}`;
      facts.push(create(edge, 'contains', name, 1, 1, fileId, id, 'contains'));
    }
  }
  return { facts, warnings, files: found.length };
}
