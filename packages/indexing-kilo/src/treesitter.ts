import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { escapeComponent, hash } from '../../core/src/hash.js';

/**
 * Declarations, calls and imports found with Tree-sitter grammars (WebAssembly).
 * Grammar files come from `@vscode/tree-sitter-wasm` (MIT) and `tree-sitter-wasms` (Unlicense; underlying grammars are MIT).
 */
export interface TsDecl { name: string; kind: string; start: number; end: number; signature: string | null; bodyHash: string | null; calls: string[]; }
export interface TsImport {
  /**
   * `relative`: a name or path relative to the importing file (TypeScript style, Rust `mod`).
   * `module`: a dotted or backslash-separated name searched among known files by path suffix.
   * `file`: a path relative to the importing file, tried exactly and with each of `extensions` appended.
   */
  mode: 'relative' | 'module' | 'file'; specifier: string; bindings: { local: string; imported: string }[]; extensions?: string[];
}
export type TsLanguage = 'typescript' | 'tsx' | 'javascript' | 'python' | 'go' | 'rust' | 'java' | 'csharp' | 'c' | 'cpp' | 'ruby' | 'php' | 'kotlin' | 'swift' | 'solidity';

interface SyntaxNode {
  id: number; type: string; text: string; isNamed: boolean; parent: SyntaxNode | null;
  startIndex: number; endIndex: number; startPosition: { row: number }; endPosition: { row: number };
  namedChildren: SyntaxNode[]; children: SyntaxNode[]; previousNamedSibling: SyntaxNode | null;
  childForFieldName(name: string): SyntaxNode | null;
  descendantsOfType(type: string): SyntaxNode[];
  hasError: boolean; isMissing: boolean;
}
interface ParserLike { setLanguage(language: unknown): void; parse(text: string): { rootNode: SyntaxNode; delete?: () => void } | null; delete?: () => void; }
interface Runtime { Parser: { new (): ParserLike; init(options: { locateFile: (file: string) => string }): Promise<void> }; Language: { load(path: string): Promise<unknown> }; }

type Source = 'vscode' | 'wasms';
const grammars: Record<TsLanguage, [Source, string]> = {
  typescript: ['vscode', 'tree-sitter-typescript.wasm'], tsx: ['vscode', 'tree-sitter-tsx.wasm'], javascript: ['vscode', 'tree-sitter-javascript.wasm'],
  python: ['vscode', 'tree-sitter-python.wasm'], go: ['vscode', 'tree-sitter-go.wasm'], rust: ['vscode', 'tree-sitter-rust.wasm'],
  java: ['vscode', 'tree-sitter-java.wasm'], csharp: ['vscode', 'tree-sitter-c-sharp.wasm'], cpp: ['vscode', 'tree-sitter-cpp.wasm'],
  ruby: ['vscode', 'tree-sitter-ruby.wasm'], php: ['vscode', 'tree-sitter-php.wasm'],
  c: ['wasms', 'tree-sitter-c.wasm'], kotlin: ['wasms', 'tree-sitter-kotlin.wasm'], swift: ['wasms', 'tree-sitter-swift.wasm'], solidity: ['wasms', 'tree-sitter-solidity.wasm']
};
const extensions: Record<string, TsLanguage> = {
  '.ts': 'typescript', '.mts': 'typescript', '.cts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java', '.cs': 'csharp', '.c': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hh': 'cpp', '.hxx': 'cpp', '.h': 'cpp',
  '.rb': 'ruby', '.php': 'php', '.kt': 'kotlin', '.kts': 'kotlin', '.swift': 'swift', '.sol': 'solidity'
};
/** Source suffixes the provider indexes, from the language table. */
export const sourceExtensions = Object.keys(extensions).map((extension) => extension.slice(1));
export const languageOf = (relative: string): TsLanguage | null => extensions[path.posix.extname(relative).toLowerCase()] ?? null;
export const isScript = (language: TsLanguage | null): boolean => language === 'typescript' || language === 'tsx' || language === 'javascript';

let runtime: Promise<{ api: Runtime; directories: Record<Source, string> } | null> | undefined;
const languages = new Map<TsLanguage, Promise<unknown | null>>();

function load(): Promise<{ api: Runtime; directories: Record<Source, string> } | null> {
  runtime ??= (async () => {
    try {
      const require = createRequire(import.meta.url);
      const vscode = path.join(path.dirname(require.resolve('@vscode/tree-sitter-wasm/package.json')), 'wasm');
      let wasms = '';
      try { wasms = path.join(path.dirname(require.resolve('tree-sitter-wasms/package.json')), 'out'); } catch { /* optional grammars only */ }
      const api = require('@vscode/tree-sitter-wasm') as Runtime;
      await api.Parser.init({ locateFile: (file: string) => path.join(vscode, file) });
      return { api, directories: { vscode, wasms } };
    } catch { return null; }
  })();
  return runtime;
}

let loading: Promise<unknown> = Promise.resolve();
/** Grammars load one at a time, on first use. */
function grammarFor(language: TsLanguage, loaded: { api: Runtime; directories: Record<Source, string> }): Promise<unknown | null> {
  let grammar = languages.get(language);
  if (!grammar) {
    const [source, file] = grammars[language];
    const directory = loaded.directories[source];
    const open = async (): Promise<unknown | null> => {
      if (!directory) return null;
      try { return await loaded.api.Language.load(path.join(directory, file)); }
      catch { return null; }
    };
    grammar = loading.then(open, open);
    loading = grammar;
    languages.set(language, grammar);
  }
  return grammar;
}

export async function treeSitterAvailable(): Promise<boolean> { return (await load()) !== null; }

const digest = (text: string | null | undefined): string | null => {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length < 24 ? null : createHash('sha256').update(normalized).digest('hex').slice(0, 16);
};

interface Draft extends TsDecl { callSet: Set<string>; owner: string | null; }

/** Everything a language walker needs; walkers only read syntax and report through this. */
interface Ctx {
  drafts: Draft[]; imports: TsImport[];
  field(node: SyntaxNode, name: string): SyntaxNode | null;
  qualify(scope: string[], name: string): string;
  declare(node: SyntaxNode, scope: string[], name: string, kind: string, bodyNode: SyntaxNode | null, parameters: SyntaxNode | null, owner: string | null): Draft;
  addCall(current: Draft | null, name: string): void;
}
const lineOf = (node: SyntaxNode) => ({ start: node.startPosition.row + 1, end: node.endPosition.row + 1 });
const first = (node: SyntaxNode, type: string): SyntaxNode | null => node.namedChildren.find((child) => child.type === type) ?? null;
const last = (text: string, separator: RegExp): string => text.split(separator).filter(Boolean).pop() ?? text;
const capitalized = (text: string): boolean => /^[A-Z]/.test(text);

function walkPython(c: Ctx, root: SyntaxNode): void {
  const walk = (node: SyntaxNode, scope: string[], current: Draft | null): void => {
    let nextScope = scope, nextCurrent = current;
    if (node.type === 'class_definition' || node.type === 'function_definition') {
      const name = c.field(node, 'name')?.text;
      if (name) {
        const isClass = node.type === 'class_definition';
        const insideClass = scope.length > 0 && current?.kind === 'class';
        const draft = c.declare(node, scope, name, isClass ? 'class' : insideClass ? 'method' : 'function', c.field(node, 'body'), isClass ? null : c.field(node, 'parameters'), scope.length ? scope[scope.length - 1]! : null);
        if (isClass) { nextScope = [...scope, name]; nextCurrent = draft; }
        else if (current && current.kind !== 'class') { c.drafts.pop(); nextCurrent = current; } // nested functions stay on the outer one
        else nextCurrent = draft;
      }
    } else if (node.type === 'call' && current) {
      const callee = c.field(node, 'function');
      if (callee?.type === 'identifier') c.addCall(current, callee.text);
      else if (callee?.type === 'attribute') {
        const object = c.field(callee, 'object'), attribute = c.field(callee, 'attribute');
        if (object && attribute && (object.text === 'self' || object.text === 'cls') && scope.length) c.addCall(current, c.qualify(scope, attribute.text));
      }
    } else if (node.type === 'import_from_statement') {
      const module = c.field(node, 'module_name');
      if (module) {
        const bindings: TsImport['bindings'] = [];
        for (const child of node.namedChildren) {
          if (child === module) continue;
          if (child.type === 'dotted_name') bindings.push({ local: child.text, imported: child.text });
          else if (child.type === 'aliased_import') {
            const imported = c.field(child, 'name')?.text, alias = c.field(child, 'alias')?.text;
            if (imported) bindings.push({ local: alias ?? imported, imported });
          }
        }
        c.imports.push({ mode: 'module', specifier: module.text, bindings });
      }
    } else if (node.type === 'import_statement') {
      for (const child of node.namedChildren) {
        const target = child.type === 'aliased_import' ? c.field(child, 'name') : child;
        if (target?.type === 'dotted_name') c.imports.push({ mode: 'module', specifier: target.text, bindings: [] });
      }
    }
    for (const child of node.namedChildren) walk(child, nextScope, nextCurrent);
  };
  walk(root, [], null);
}

function walkGo(c: Ctx, root: SyntaxNode): void {
  type Receiver = { variable: string | null; type: string | null };
  const receiverType = (node: SyntaxNode): Receiver => {
    const parameter = first(node, 'parameter_declaration');
    if (!parameter) return { variable: null, type: null };
    let type = c.field(parameter, 'type');
    if (type?.type === 'pointer_type') type = type.namedChildren[0] ?? null;
    if (type?.type === 'generic_type') type = c.field(type, 'type');
    return { variable: c.field(parameter, 'name')?.text ?? null, type: type?.text ?? null };
  };
  const walk = (node: SyntaxNode, receiver: Receiver | null, current: Draft | null): void => {
    let nextReceiver = receiver, nextCurrent = current;
    if (node.type === 'function_declaration') {
      const name = c.field(node, 'name')?.text;
      if (name) { nextCurrent = c.declare(node, [], name, 'function', c.field(node, 'body'), c.field(node, 'parameters'), null); nextReceiver = null; }
    } else if (node.type === 'method_declaration') {
      const name = c.field(node, 'name')?.text;
      const recv = c.field(node, 'receiver');
      const info = recv ? receiverType(recv) : { variable: null, type: null };
      if (name && info.type) { nextCurrent = c.declare(node, [info.type], name, 'method', c.field(node, 'body'), c.field(node, 'parameters'), info.type); nextReceiver = info; }
    } else if (node.type === 'type_spec') {
      const name = c.field(node, 'name')?.text;
      const type = c.field(node, 'type');
      if (name && type && (type.type === 'struct_type' || type.type === 'interface_type')) c.declare(node, [], name, 'type', type, null, null);
    } else if (node.type === 'call_expression' && current) {
      const callee = c.field(node, 'function');
      if (callee?.type === 'identifier') c.addCall(current, callee.text);
      else if (callee?.type === 'selector_expression' && receiver?.variable && receiver.type) {
        if (c.field(callee, 'operand')?.text === receiver.variable) c.addCall(current, c.qualify([receiver.type], c.field(callee, 'field')?.text ?? ''));
      }
    }
    for (const child of node.namedChildren) walk(child, nextReceiver, nextCurrent);
  };
  walk(root, null, null);
}

function walkRust(c: Ctx, root: SyntaxNode): void {
  const typeName = (node: SyntaxNode | null): string | null => {
    if (!node) return null;
    if (node.type === 'generic_type') return typeName(c.field(node, 'type'));
    if (node.type === 'type_identifier') return node.text;
    if (node.type === 'scoped_type_identifier') return c.field(node, 'name')?.text ?? null;
    return null;
  };
  const walk = (node: SyntaxNode, scope: string[], current: Draft | null): void => {
    let nextScope = scope, nextCurrent = current;
    if (node.type === 'impl_item' || node.type === 'trait_item') {
      const name = node.type === 'impl_item' ? typeName(c.field(node, 'type')) : c.field(node, 'name')?.text ?? null;
      if (node.type === 'trait_item' && name) c.declare(node, [], name, 'trait', c.field(node, 'body'), null, null);
      if (name) nextScope = [name];
    } else if (node.type === 'struct_item' || node.type === 'enum_item') {
      const name = c.field(node, 'name')?.text;
      if (name) c.declare(node, [], name, node.type === 'struct_item' ? 'struct' : 'enum', c.field(node, 'body') ?? node, null, null);
    } else if (node.type === 'function_item') {
      const name = c.field(node, 'name')?.text;
      if (name) {
        const inType = scope.length > 0;
        const draft = c.declare(node, scope, name, inType ? 'method' : 'function', c.field(node, 'body'), c.field(node, 'parameters'), inType ? scope[0]! : null);
        if (current) c.drafts.pop(); else nextCurrent = draft; // nested functions stay on the outer one
      }
    } else if (node.type === 'mod_item' && !c.field(node, 'body')) {
      const name = c.field(node, 'name')?.text;
      if (name) c.imports.push({ mode: 'relative', specifier: name, bindings: [] });
    } else if (node.type === 'call_expression' && current) {
      const callee = c.field(node, 'function');
      if (callee?.type === 'identifier') c.addCall(current, callee.text);
      else if (callee?.type === 'field_expression') {
        if (c.field(callee, 'value')?.text === 'self' && scope.length) c.addCall(current, c.qualify([scope[0]!], c.field(callee, 'field')?.text ?? ''));
      } else if (callee?.type === 'scoped_identifier') {
        const owner = c.field(callee, 'path')?.text, name = c.field(callee, 'name')?.text;
        if (owner && name && /^[A-Za-z_]\w*$/.test(owner)) c.addCall(current, c.qualify([owner === 'Self' && scope.length ? scope[0]! : owner], name));
      }
    }
    for (const child of node.namedChildren) walk(child, nextScope, nextCurrent);
  };
  walk(root, [], null);
}

function walkJava(c: Ctx, root: SyntaxNode): void {
  const typeKinds: Record<string, string> = { class_declaration: 'class', interface_declaration: 'interface', enum_declaration: 'enum', record_declaration: 'record' };
  const walk = (node: SyntaxNode, scope: string[], current: Draft | null): void => {
    let nextScope = scope, nextCurrent = current;
    if (typeKinds[node.type]) {
      const name = c.field(node, 'name')?.text;
      if (name) { nextCurrent = c.declare(node, scope, name, typeKinds[node.type]!, c.field(node, 'body'), null, scope.length ? scope[scope.length - 1]! : null); nextScope = [...scope, name]; }
    } else if ((node.type === 'method_declaration' || node.type === 'constructor_declaration') && scope.length) {
      const name = c.field(node, 'name')?.text;
      if (name) nextCurrent = c.declare(node, scope, name, node.type === 'method_declaration' ? 'method' : 'constructor', c.field(node, 'body'), c.field(node, 'parameters'), scope[scope.length - 1]!);
    } else if (node.type === 'method_invocation' && current) {
      const object = c.field(node, 'object'), name = c.field(node, 'name')?.text;
      if (name && (!object || object.text === 'this') && scope.length) c.addCall(current, c.qualify(scope, name));
      else if (name && object?.type === 'identifier' && capitalized(object.text)) c.addCall(current, c.qualify([object.text], name));
    } else if (node.type === 'import_declaration') {
      const target = node.namedChildren.find((child) => child.type === 'scoped_identifier' || child.type === 'identifier');
      const wildcard = node.namedChildren.some((child) => child.type === 'asterisk');
      if (target && !wildcard && !node.children.some((child) => child.type === 'static')) {
        const name = last(target.text, /\./);
        c.imports.push({ mode: 'module', specifier: target.text, bindings: [{ local: name, imported: name }] });
      }
    }
    for (const child of node.namedChildren) walk(child, nextScope, nextCurrent);
  };
  walk(root, [], null);
}

/** What a language adapter says about one node. The shared walker handles scope, nesting and call attribution. */
type Shape =
  | { type: 'type'; name: string; kind: string; body: SyntaxNode | null }
  | { type: 'function'; name: string; kind?: string; scope?: string[]; body: SyntaxNode | null; parameters: SyntaxNode | null }
  | null;
interface Adapter {
  shape(node: SyntaxNode, scope: string[]): Shape;
  /** The callee name for a call node, relative to the enclosing type scope. */
  call(node: SyntaxNode, scope: string[]): string | null;
  imports?(node: SyntaxNode): TsImport[];
}

function walkWith(c: Ctx, root: SyntaxNode, adapter: Adapter): void {
  const walk = (node: SyntaxNode, scope: string[], current: Draft | null): void => {
    let nextScope = scope, nextCurrent = current;
    const shape = adapter.shape(node, scope);
    if (shape?.type === 'type') {
      const draft = c.declare(node, scope, shape.name, shape.kind, shape.body, null, scope.length ? scope[scope.length - 1]! : null);
      nextScope = [...scope, shape.name]; nextCurrent = draft;
    } else if (shape?.type === 'function') {
      const home = shape.scope ?? scope;
      const draft = c.declare(node, home, shape.name, shape.kind ?? (home.length ? 'method' : 'function'), shape.body, shape.parameters, home.length ? home[home.length - 1]! : null);
      // A function nested in a function stays attributed to the outer one.
      if (current && current.kind !== 'class' && current.kind !== 'interface' && current.kind !== 'struct' && current.kind !== 'module' && current.kind !== 'contract' && current.kind !== 'library' && current.kind !== 'trait' && current.kind !== 'enum' && current.kind !== 'record' && current.kind !== 'object' && current.kind !== 'extension' && current.kind !== 'protocol') c.drafts.pop();
      else nextCurrent = draft;
    } else if (current) {
      const called = adapter.call(node, scope);
      if (called) c.addCall(current, called);
    }
    for (const found of adapter.imports?.(node) ?? []) c.imports.push(found);
    for (const child of node.namedChildren) walk(child, nextScope, nextCurrent);
  };
  walk(root, [], null);
}

const csharp: Adapter = {
  shape(node, scope) {
    const kinds: Record<string, string> = { class_declaration: 'class', interface_declaration: 'interface', struct_declaration: 'struct', enum_declaration: 'enum', record_declaration: 'record', record_struct_declaration: 'record' };
    const field = (name: string) => node.childForFieldName(name);
    if (kinds[node.type]) { const name = field('name')?.text; return name ? { type: 'type', name, kind: kinds[node.type]!, body: field('body') } : null; }
    if (node.type === 'method_declaration' || node.type === 'constructor_declaration') {
      const name = field('name')?.text;
      return name ? { type: 'function', name, kind: scope.length ? (node.type === 'constructor_declaration' ? 'constructor' : 'method') : 'function', body: field('body') ?? first(node, 'arrow_expression_clause'), parameters: field('parameters') } : null;
    }
    return null;
  },
  call(node, scope) {
    if (node.type !== 'invocation_expression') return null;
    const callee = node.childForFieldName('function');
    if (callee?.type === 'identifier') return callee.text;
    if (callee?.type === 'member_access_expression') {
      const name = callee.childForFieldName('name')?.text;
      const object = callee.childForFieldName('expression');
      if (!name) return null;
      if ((!object || object.type === 'this_expression') && /^(?:this|base)\./.test(callee.text) && scope.length) return [...scope, name].map(escapeComponent).join('.');
      if (object?.type === 'identifier' && capitalized(object.text)) return `${escapeComponent(object.text)}.${escapeComponent(name)}`;
    }
    return null;
  }
};

/** `a::B::name` is nested qualified identifiers; the owner is the segment before the name. */
function qualifiedName(node: SyntaxNode): { name: string; owner: string | null } | null {
  const parts: string[] = [];
  let current: SyntaxNode | null = node;
  while (current?.type === 'qualified_identifier') {
    const scope = current.childForFieldName('scope')?.text;
    if (scope) parts.push(...scope.replace(/<[^<>]*>/g, '').split('::').filter(Boolean));
    current = current.childForFieldName('name');
  }
  return current ? { name: current.text, owner: parts.length ? parts[parts.length - 1]! : null } : null;
}

/** Name and optional class qualifier of a C or C++ function definition. */
function cDeclarator(node: SyntaxNode): { name: string; qualifier: string | null; parameters: SyntaxNode | null } | null {
  let declarator = node.childForFieldName('declarator');
  for (let depth = 0; declarator && declarator.type !== 'function_declarator' && depth < 8; depth++) declarator = declarator.childForFieldName('declarator');
  if (!declarator || declarator.type !== 'function_declarator') return null;
  const target = declarator.childForFieldName('declarator');
  if (!target) return null;
  const parameters = declarator.childForFieldName('parameters');
  if (target.type === 'qualified_identifier') {
    const found = qualifiedName(target);
    return found ? { name: found.name, qualifier: found.owner, parameters } : null;
  }
  if (['identifier', 'field_identifier', 'destructor_name', 'operator_name'].includes(target.type)) return { name: target.text, qualifier: null, parameters };
  return null;
}
const cLike = (cxx: boolean): Adapter => ({
  shape(node, scope) {
    if (node.type === 'class_specifier' || node.type === 'struct_specifier' || node.type === 'enum_specifier') {
      const name = node.childForFieldName('name');
      const body = node.childForFieldName('body');
      if (!name || !body || !['type_identifier'].includes(name.type)) return null;
      return { type: 'type', name: name.text, kind: node.type === 'class_specifier' ? 'class' : node.type === 'struct_specifier' ? 'struct' : 'enum', body };
    }
    if (node.type === 'function_definition') {
      const found = cDeclarator(node);
      if (!found) return null;
      const home = found.qualifier ? [found.qualifier] : scope;
      return { type: 'function', name: found.name, scope: home, kind: home.length ? 'method' : 'function', body: node.childForFieldName('body'), parameters: found.parameters };
    }
    return null;
  },
  call(node, scope) {
    if (node.type !== 'call_expression') return null;
    const callee = node.childForFieldName('function');
    if (callee?.type === 'identifier') return callee.text;
    if (cxx && callee?.type === 'field_expression' && callee.childForFieldName('argument')?.type === 'this' && scope.length) {
      const field = callee.childForFieldName('field')?.text;
      return field ? [...scope, field].map(escapeComponent).join('.') : null;
    }
    if (cxx && callee?.type === 'qualified_identifier') {
      const found = qualifiedName(callee);
      return found?.owner ? `${escapeComponent(found.owner)}.${escapeComponent(found.name)}` : null;
    }
    return null;
  },
  imports(node) {
    if (node.type !== 'preproc_include') return [];
    const target = node.childForFieldName('path');
    return target?.type === 'string_literal' ? [{ mode: 'file', specifier: target.text.slice(1, -1), bindings: [] }] : [];
  }
});

const ruby: Adapter = {
  shape(node, scope) {
    if (node.type === 'class' || node.type === 'module') {
      const name = node.childForFieldName('name');
      return name ? { type: 'type', name: last(name.text, /::/), kind: node.type === 'class' ? 'class' : 'module', body: node.childForFieldName('body') } : null;
    }
    if (node.type === 'method' || node.type === 'singleton_method') {
      const name = node.childForFieldName('name')?.text;
      return name ? { type: 'function', name, kind: scope.length ? 'method' : 'function', body: node.childForFieldName('body'), parameters: node.childForFieldName('parameters') } : null;
    }
    return null;
  },
  call(node, scope) {
    if (node.type === 'identifier' && node.parent?.type === 'body_statement') return node.text; // a bare word statement is a call when it names a method
    if (node.type !== 'call') return null;
    const method = node.childForFieldName('method')?.text;
    const receiver = node.childForFieldName('receiver');
    if (!method) return null;
    if (!receiver) return method === 'require_relative' || method === 'require' ? null : method;
    if (receiver.type === 'self' && scope.length) return [...scope, method].map(escapeComponent).join('.');
    if (receiver.type === 'constant') return `${escapeComponent(last(receiver.text, /::/))}.${escapeComponent(method)}`;
    return null;
  },
  imports(node) {
    if (node.type !== 'call' || node.childForFieldName('receiver') || node.childForFieldName('method')?.text !== 'require_relative') return [];
    const target = node.childForFieldName('arguments')?.namedChildren[0];
    return target?.type === 'string' ? [{ mode: 'file', specifier: target.text.slice(1, -1), bindings: [], extensions: ['.rb'] }] : [];
  }
};

const php: Adapter = {
  shape(node, scope) {
    const kinds: Record<string, string> = { class_declaration: 'class', interface_declaration: 'interface', trait_declaration: 'trait', enum_declaration: 'enum' };
    if (kinds[node.type]) { const name = node.childForFieldName('name')?.text; return name ? { type: 'type', name, kind: kinds[node.type]!, body: node.childForFieldName('body') } : null; }
    if (node.type === 'function_definition' || node.type === 'method_declaration') {
      const name = node.childForFieldName('name')?.text;
      return name ? { type: 'function', name, kind: node.type === 'method_declaration' && scope.length ? 'method' : 'function', body: node.childForFieldName('body'), parameters: node.childForFieldName('parameters') } : null;
    }
    return null;
  },
  call(node, scope) {
    if (node.type === 'function_call_expression') {
      const callee = node.childForFieldName('function');
      return callee ? last(callee.text, /\\/) : null;
    }
    if (node.type === 'member_call_expression') {
      const name = node.childForFieldName('name')?.text;
      return name && node.childForFieldName('object')?.text === '$this' && scope.length ? [...scope, name].map(escapeComponent).join('.') : null;
    }
    if (node.type === 'scoped_call_expression') {
      const name = node.childForFieldName('name')?.text, owner = node.childForFieldName('scope');
      if (!name || !owner) return null;
      if (owner.type === 'relative_scope') return /^(?:self|static)$/.test(owner.text) && scope.length ? [...scope, name].map(escapeComponent).join('.') : null;
      return `${escapeComponent(last(owner.text, /\\/))}.${escapeComponent(name)}`;
    }
    return null;
  },
  imports(node) {
    if (node.type === 'namespace_use_declaration') {
      const found: TsImport[] = [];
      for (const clause of node.namedChildren.filter((child) => child.type === 'namespace_use_clause')) {
        const target = first(clause, 'qualified_name') ?? first(clause, 'name');
        if (!target) continue;
        const imported = last(target.text, /\\/);
        const alias = clause.childForFieldName('alias')?.text;
        found.push({ mode: 'module', specifier: target.text.replace(/^\\/, ''), bindings: [{ local: alias ?? imported, imported }] });
      }
      return found;
    }
    if (/^(?:require|require_once|include|include_once)_expression$/.test(node.type)) {
      const target = node.namedChildren[0];
      return target?.type === 'string' ? [{ mode: 'file', specifier: target.text.slice(1, -1), bindings: [] }] : [];
    }
    return [];
  }
};

const kotlin: Adapter = {
  shape(node, scope) {
    if (node.type === 'class_declaration' || node.type === 'object_declaration') {
      const name = first(node, 'type_identifier')?.text;
      if (!name) return null;
      const kind = node.type === 'object_declaration' ? 'object' : node.children.some((child) => child.type === 'interface') ? 'interface'
        : node.children.some((child) => child.type === 'modifiers' && /\benum\b/.test(child.text)) ? 'enum' : 'class';
      return { type: 'type', name, kind, body: first(node, 'class_body') ?? first(node, 'enum_class_body') };
    }
    if (node.type === 'function_declaration') {
      const name = first(node, 'simple_identifier')?.text;
      return name ? { type: 'function', name, kind: scope.length ? 'method' : 'function', body: first(node, 'function_body'), parameters: first(node, 'function_value_parameters') } : null;
    }
    return null;
  },
  call(node, scope) {
    if (node.type !== 'call_expression') return null;
    const callee = node.namedChildren[0];
    if (callee?.type === 'simple_identifier') return callee.text;
    if (callee?.type === 'navigation_expression') {
      const target = callee.namedChildren[0], name = first(callee.namedChildren[1] ?? callee, 'simple_identifier')?.text;
      if (!target || !name) return null;
      if (target.type === 'this_expression' && scope.length) return [...scope, name].map(escapeComponent).join('.');
      if (target.type === 'simple_identifier' && capitalized(target.text)) return `${escapeComponent(target.text)}.${escapeComponent(name)}`;
    }
    return null;
  },
  imports(node) {
    if (node.type !== 'import_header') return [];
    const target = first(node, 'identifier');
    if (!target) return [];
    const imported = last(target.text, /\./);
    const alias = first(node, 'import_alias')?.namedChildren[0]?.text;
    return [{ mode: 'module', specifier: target.text, bindings: [{ local: alias ?? imported, imported }] }];
  }
};

const swift: Adapter = {
  shape(node, scope) {
    if (node.type === 'class_declaration' || node.type === 'protocol_declaration') {
      const name = node.childForFieldName('name');
      if (!name) return null;
      const keyword = node.children.find((child) => !child.isNamed && ['class', 'struct', 'enum', 'extension', 'actor'].includes(child.type))?.type;
      return { type: 'type', name: last(name.text, /\./), kind: node.type === 'protocol_declaration' ? 'protocol' : keyword ?? 'class', body: node.childForFieldName('body') };
    }
    if (node.type === 'function_declaration' || node.type === 'init_declaration') {
      const name = node.type === 'init_declaration' ? 'init' : node.childForFieldName('name')?.text;
      const parameters = node.namedChildren.filter((child) => child.type === 'parameter');
      return name ? { type: 'function', name, kind: scope.length ? (node.type === 'init_declaration' ? 'constructor' : 'method') : 'function', body: node.childForFieldName('body'),
        parameters: { text: parameters.map((parameter) => parameter.text).join(',') } as unknown as SyntaxNode } : null;
    }
    return null;
  },
  call(node, scope) {
    if (node.type !== 'call_expression') return null;
    const callee = node.namedChildren[0];
    if (callee?.type === 'simple_identifier') return callee.text;
    if (callee?.type === 'navigation_expression') {
      const target = callee.childForFieldName('target'), name = callee.childForFieldName('suffix')?.childForFieldName('suffix')?.text;
      if (!target || !name) return null;
      if (target.type === 'self_expression' && scope.length) return [...scope, name].map(escapeComponent).join('.');
      if (target.type === 'simple_identifier' && capitalized(target.text)) return `${escapeComponent(target.text)}.${escapeComponent(name)}`;
    }
    return null;
  }
};

const solidity: Adapter = {
  shape(node, scope) {
    const kinds: Record<string, string> = { contract_declaration: 'contract', interface_declaration: 'interface', library_declaration: 'library' };
    if (kinds[node.type]) { const name = node.childForFieldName('name')?.text; return name ? { type: 'type', name, kind: kinds[node.type]!, body: node.childForFieldName('body') } : null; }
    if (node.type === 'function_definition' || node.type === 'modifier_definition' || node.type === 'constructor_definition') {
      const name = node.type === 'constructor_definition' ? 'constructor' : node.childForFieldName('name')?.text;
      return name ? { type: 'function', name, kind: node.type === 'modifier_definition' ? 'modifier' : node.type === 'constructor_definition' ? 'constructor' : scope.length ? 'function' : 'function',
        body: node.childForFieldName('body'), parameters: { text: node.namedChildren.filter((child) => child.type === 'parameter').map((parameter) => parameter.text).join(',') } as unknown as SyntaxNode } : null;
    }
    return null;
  },
  call(node, scope) {
    if (node.type === 'modifier_invocation') return node.namedChildren[0]?.text ?? null;
    if (node.type !== 'call_expression') return null;
    const callee = node.childForFieldName('function');
    if (callee?.type === 'identifier') return callee.text;
    if (callee?.type === 'member_expression') {
      const object = callee.childForFieldName('object'), property = callee.childForFieldName('property')?.text;
      if (!object || !property) return null;
      if (object.text === 'this' && scope.length) return [...scope, property].map(escapeComponent).join('.');
      if (object.type === 'identifier' && capitalized(object.text)) return `${escapeComponent(object.text)}.${escapeComponent(property)}`;
    }
    return null;
  },
  imports(node) {
    if (node.type !== 'import_directive') return [];
    const source = node.childForFieldName('source');
    const specifier = source?.text.slice(1, -1);
    return specifier?.startsWith('.') ? [{ mode: 'file', specifier, bindings: [] }] : [];
  }
};

/**
 * TypeScript and JavaScript. Identities, line ranges, signatures, body digests and calls reproduce what the TypeScript
 * compiler API provider produced, so symbol ids do not change when the parser does (checked by the equivalence tests).
 */
function walkScript(c: Ctx, root: SyntaxNode): void {
  const startNode = (node: SyntaxNode): SyntaxNode => {
    let start = node;
    if (start.parent?.type === 'ambient_declaration') start = start.parent;
    if (start.parent?.type === 'export_statement' && start.parent.childForFieldName('declaration')?.id === start.id) start = start.parent;
    return start;
  };
  // The grammar can attach a comment after the closing brace to the declaration; the compiler's node ends at the brace.
  const lastCode = (node: SyntaxNode): SyntaxNode => {
    for (let index = node.children.length - 1; index > 0; index--) if (node.children[index]!.type !== 'comment') return node.children[index]!;
    return node;
  };
  const startRow = (node: SyntaxNode): number => {
    let row = startNode(node).startPosition.row;
    for (let previous = startNode(node).previousNamedSibling; previous?.type === 'decorator'; previous = previous.previousNamedSibling) row = Math.min(row, previous.startPosition.row);
    return row + 1;
  };
  const parameterSignature = (parameters: SyntaxNode | null): string | null => {
    if (!parameters) return null;
    const types = parameters.namedChildren.filter((child) => child.type !== 'comment').map((parameter) => {
      const annotation = parameter.childForFieldName('type');
      const inner = annotation?.type === 'type_annotation' ? annotation.namedChildren[0] : annotation;
      return inner ? inner.text.replace(/\s+/g, '') : '?';
    });
    return hash(types).slice(0, 8);
  };
  const push = (node: SyntaxNode, scope: string[], name: string, kind: string, bodyText: string | undefined, parameters: SyntaxNode | null, signature: boolean, rangeNode: SyntaxNode = node): Draft => {
    const draft: Draft = { name: c.qualify(scope, name), kind, start: startRow(rangeNode), end: lastCode(rangeNode).endPosition.row + 1,
      signature: signature ? parameterSignature(parameters) : null, bodyHash: digest(bodyText), calls: [], callSet: new Set(), owner: null };
    c.drafts.push(draft);
    return draft;
  };
  const walk = (node: SyntaxNode, scope: string[], owner: Draft | null): void => {
    let nextScope = scope, nextOwner = owner;
    switch (node.type) {
      case 'function_declaration': case 'generator_function_declaration': case 'function_signature': {
        const name = node.childForFieldName('name');
        if (name?.type === 'identifier') nextOwner = push(node, scope, name.text, 'function', node.childForFieldName('body')?.text, node.childForFieldName('parameters'), true);
        break;
      }
      case 'class_declaration': case 'abstract_class_declaration': {
        const name = node.childForFieldName('name');
        if (name && (name.type === 'identifier' || name.type === 'type_identifier')) {
          const first = startNode(node), text = first.text.slice(0, lastCode(node).endIndex - first.startIndex);
          nextOwner = push(node, scope, name.text, 'class', text.replace(new RegExp(`\\b${name.text}\\b`, 'g'), '_'), null, false);
          nextScope = [...scope, name.text];
        }
        break;
      }
      case 'interface_declaration': {
        const name = node.childForFieldName('name');
        if (name?.type === 'type_identifier') { nextOwner = push(node, scope, name.text, 'interface', undefined, null, false); nextScope = [...scope, name.text]; }
        break;
      }
      case 'method_definition': case 'method_signature': case 'abstract_method_signature': {
        if (node.type === 'method_signature' && node.parent?.type !== 'class_body') break; // interface and type-literal members are not declarations
        const name = node.childForFieldName('name');
        const accessor = node.children.some((child) => !child.isNamed && (child.type === 'get' || child.type === 'set'));
        if (name?.type === 'property_identifier' && !accessor && !(name.text === 'constructor' && node.parent?.type === 'class_body')) {
          nextOwner = push(node, scope, name.text, 'method', node.childForFieldName('body')?.text, node.childForFieldName('parameters'), true);
        }
        break;
      }
      case 'variable_declarator': {
        const name = node.childForFieldName('name');
        if (name?.type === 'identifier') nextOwner = push(node, scope, name.text, 'variable', node.childForFieldName('value')?.text, null, false);
        break;
      }
      case 'for_in_statement': {
        const left = node.childForFieldName('left');
        if (left?.type === 'identifier' && node.children.some((child) => !child.isNamed && ['const', 'let', 'var'].includes(child.type))) push(left, scope, left.text, 'variable', undefined, null, false); // owns nothing: the loop body belongs to the enclosing declaration
        break;
      }
      case 'catch_clause': {
        const parameter = node.childForFieldName('parameter');
        if (parameter?.type === 'identifier') push(parameter, scope, parameter.text, 'variable', undefined, null, false);
        break;
      }
      case 'call_expression': {
        let callee = node.childForFieldName('function');
        // With type arguments the grammar binds `await f<T>(x)` and `!f<T>(x)` to the identifier alone.
        while (callee && (callee.type === 'await_expression' || callee.type === 'unary_expression') && callee.namedChildren.length === 1) callee = callee.namedChildren[0]!;
        if (callee?.type === 'identifier' && callee.text !== 'await') c.addCall(owner, callee.text); // the JavaScript grammar reads `await (x)` as a call
        break;
      }
      case 'import_statement': {
        const source = node.childForFieldName('source');
        const specifier = source?.text.slice(1, -1);
        if (specifier?.startsWith('.')) {
          const bindings: TsImport['bindings'] = [];
          const named = node.namedChildren.find((child) => child.type === 'import_clause')?.namedChildren.find((child) => child.type === 'named_imports');
          for (const element of named?.namedChildren ?? []) {
            if (element.type !== 'import_specifier') continue;
            const imported = element.childForFieldName('name')?.text, alias = element.childForFieldName('alias')?.text;
            if (imported) bindings.push({ local: alias ?? imported, imported });
          }
          c.imports.push({ mode: 'relative', specifier, bindings });
        }
        break;
      }
      default: break;
    }
    for (const child of node.namedChildren) walk(child, nextScope, nextOwner);
  };
  walk(root, [], null);
}

/**
 * One child process, started with `--liftoff-only`, parses every Swift file of a scan (newline-delimited JSON over stdio).
 * Starting a process per file costs about 0.1 s each and can exceed the command deadline on large Swift trees.
 */
const swiftWorker = (() => {
  const timeoutMs = 60_000;
  const childScript = `import { parseWithTreeSitter } from ${JSON.stringify(import.meta.url)};
    import readline from 'node:readline';
    for await (const line of readline.createInterface({ input: process.stdin })) {
      const { id, text } = JSON.parse(line);
      let result = null;
      try { result = await parseWithTreeSitter('swift', text); } catch { result = null; }
      process.stdout.write(JSON.stringify({ id, result }) + '\\n');
    }`;
  let child: ChildProcess | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let nextId = 0;
  const waiting = new Map<number, (value: unknown) => void>();

  function stop(): void {
    const current = child;
    child = null;
    current?.kill();
    for (const [id, done] of waiting) { waiting.delete(id); done(null); }
  }
  function start(): ChildProcess {
    const created = spawn(process.execPath, ['--liftoff-only', '--input-type=module', '-e', childScript], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    let pending = '';
    created.stdout!.setEncoding('utf8');
    created.stdout!.on('data', (chunk: string) => {
      pending += chunk;
      for (let end = pending.indexOf('\n'); end >= 0; end = pending.indexOf('\n')) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        try { const { id, result } = JSON.parse(line) as { id: number; result: unknown }; waiting.get(id)?.(result); waiting.delete(id); } catch { /* malformed reply: the request times out */ }
      }
    });
    created.stdin!.on('error', () => { /* an early exit is handled by the close event */ });
    created.on('error', () => { if (child === created) stop(); });
    created.on('close', () => { if (child === created) stop(); });
    return created;
  }
  async function one(text: string): Promise<unknown> {
    child ??= start();
    const id = nextId++;
    const reply = new Promise<unknown>((resolve) => {
      const timer = setTimeout(() => { if (waiting.has(id)) stop(); }, timeoutMs);
      waiting.set(id, (value) => { clearTimeout(timer); resolve(value); });
    });
    child.stdin!.write(JSON.stringify({ id, text }) + '\n');
    return reply;
  }
  return {
    parse(text: string): Promise<{ decls: TsDecl[]; imports: TsImport[]; recovered: boolean } | null> {
      const run = queue.then(() => one(text), () => one(text));
      queue = run.catch(() => null);
      return run as Promise<{ decls: TsDecl[]; imports: TsImport[]; recovered: boolean } | null>;
    },
    /** Ends the child; the next Swift file starts a new one. */
    close(): void { child?.stdin?.end(); child = null; },
  };
})();

/** Release helper processes. Safe to call at any time; scans call it when they finish. */
export function closeParsers(): void { swiftWorker.close(); }

/** Parse one file. Returns null when the grammar cannot be loaded, so the caller can fall back. */
export async function parseWithTreeSitter(language: TsLanguage, text: string): Promise<{ decls: TsDecl[]; imports: TsImport[]; recovered: boolean } | null> {
  // Swift's optimizing Wasm compile can fatally exhaust V8's Zone on Node 24. Runtime flag changes do not prevent it;
  // isolate that grammar with a startup flag instead of changing the importing application's V8 configuration.
  if (language === 'swift' && !process.execArgv.includes('--liftoff-only')) return swiftWorker.parse(text);
  const loaded = await load();
  if (!loaded) return null;
  const resolved = await grammarFor(language, loaded);
  if (!resolved) return null;
  const parser = new loaded.api.Parser();
  try {
    parser.setLanguage(resolved);
    const tree = parser.parse(text);
    if (!tree) return null;
    try {
      const drafts: Draft[] = [];
      const imports: TsImport[] = [];
      const qualify = (scope: string[], name: string) => [...scope, name].map(escapeComponent).join('.');
      const ctx: Ctx = {
        drafts, imports, qualify,
        field: (node, name) => node.childForFieldName(name),
        declare: (node, scope, name, kind, bodyNode, parameters, owner) => {
          const draft: Draft = { name: qualify(scope, name), kind, ...lineOf(node), signature: parameters ? hash(parameters.text.replace(/\s+/g, '')).slice(0, 8) : null,
            bodyHash: digest(bodyNode?.text), calls: [], callSet: new Set(), owner };
          drafts.push(draft);
          return draft;
        },
        addCall: (current, name) => { if (current && current.callSet.size < 64 && name) current.callSet.add(name); }
      };
      const root = tree.rootNode;
      switch (language) {
        case 'typescript': case 'tsx': case 'javascript': walkScript(ctx, root); break;
        case 'python': walkPython(ctx, root); break;
        case 'go': walkGo(ctx, root); break;
        case 'rust': walkRust(ctx, root); break;
        case 'java': walkJava(ctx, root); break;
        case 'csharp': walkWith(ctx, root, csharp); break;
        case 'c': walkWith(ctx, root, cLike(false)); break;
        case 'cpp': walkWith(ctx, root, cLike(true)); break;
        case 'ruby': walkWith(ctx, root, ruby); break;
        case 'php': walkWith(ctx, root, php); break;
        case 'kotlin': walkWith(ctx, root, kotlin); break;
        case 'swift': walkWith(ctx, root, swift); break;
        case 'solidity': walkWith(ctx, root, solidity); break;
      }
      // A call to a bare name inside a type means the type's own method when it has one.
      const known = new Set(drafts.map((draft) => draft.name));
      const decls: TsDecl[] = drafts.map(({ callSet, owner, ...decl }) => ({
        ...decl,
        calls: [...new Set([...callSet].map((called) => {
          const dot = decl.name.lastIndexOf('.');
          const candidate = owner !== null && dot >= 0 ? `${decl.name.slice(0, dot)}.${escapeComponent(called)}` : null;
          return candidate && known.has(candidate) ? candidate : called;
        }))].sort()
      }));
      // Inserted tokens other than automatic semicolons (Kotlin, Swift, JavaScript) and ERROR nodes mark text the grammar could not parse.
      const damaged = (node: SyntaxNode): boolean => node.type === 'ERROR' || (node.isMissing && node.type !== ';') || (node.hasError && node.children.some(damaged));
      const recovered = root.hasError && damaged(root);
      return { decls, imports, recovered };
    } finally { tree.delete?.(); }
  } finally { parser.delete?.(); }
}
