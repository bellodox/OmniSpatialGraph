import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scan } from '../dist/indexing-kilo/src/index.js';

const files = {
  "c/main.c": "#include \"util.h\"\nint main(void) { return add(1, 2); }\n",
  "c/util.c": "#include \"util.h\"\nint add(int a, int b) { return a + b; }\nstatic int twice(int x) { return add(x, x); }\nstruct Point { int x; int y; };\n",
  "c/util.h": "int add(int a, int b);\n",
  "cpp/widget.cpp": "#include \"widget.hpp\"\nvoid ui::Widget::paint() { helper(); }\nvoid helper() { }\n",
  "cpp/widget.hpp": "#pragma once\nnamespace ui {\nclass Widget {\n public:\n  Widget() {}\n  void draw() { paint(); helper(); }\n  void paint();\n};\n}\nvoid helper();\n",
  "cs/Svc.cs": "using System;\nnamespace App {\n  public class Svc : Base {\n    public Svc() { Init(); }\n    public int Run(int a) { Init(); return Util.Twice(a); }\n    void Init() { Helper(); }\n    static void Helper() { }\n    public int Prop { get; set; }\n  }\n  public static class Util { public static int Twice(int x) { return x * 2; } }\n  interface IFoo { void Bar(); }\n}\n",
  "kt/com/acme/Main.kt": "package com.acme\nimport com.acme.Util\nclass Main {\n  fun run(a: Int): Int { return Util.twice(a) + helper() }\n  private fun helper(): Int = 1\n}\n",
  "kt/com/acme/Util.kt": "package com.acme\nobject Util { fun twice(x: Int): Int { return x * 2 } }\n",
  "php/src/App/Service.php": "<?php\nnamespace App;\nuse App\\Util;\nclass Service {\n  public function run($a) { return Util::twice($a) + $this->helper(); }\n  private function helper() { return strlen(\"x\"); }\n}\nfunction standalone() { return 1; }\n",
  "php/src/App/Util.php": "<?php\nnamespace App;\nclass Util { public static function twice($x) { return $x * 2; } }\n",
  "rb/app.rb": "require_relative 'lib'\nmodule Shop\n  class Cart\n    def add(item)\n      total(item)\n    end\n    def total(item)\n      Lib.price(item)\n    end\n    def self.build\n      new\n    end\n  end\nend\n",
  "rb/lib.rb": "class Lib\n  def self.price(item)\n    item.to_i * 2\n  end\nend\n",
  "sol/Lib.sol": "library Lib { function base() internal pure returns (uint256) { return 1; } }\n",
  "sol/Token.sol": "pragma solidity ^0.8.0;\nimport \"./Lib.sol\";\ncontract Token {\n  uint256 total;\n  modifier onlyOwner() { _; }\n  constructor() { init(); }\n  function init() internal { total = Lib.base(); }\n  function mint(uint256 n) public onlyOwner { total += n; check(); }\n  function check() internal view returns (bool) { return total > 0; }\n}\n",
  "swift/App.swift": "import Foundation\nclass App {\n  init() { setup() }\n  func setup() { helper(3) }\n  func helper(_ n: Int) -> Int { return n }\n}\nprotocol Greeter { func greet() }\nfunc top() { print(\"x\") }\n",
  "web/a.tsx": "import { b } from './b';\nexport const View = () => <div>{b()}</div>;\nexport function Comp(props: { n: number }) { return <span>{props.n}</span>; }\n",
  "web/b.js": "export function b() { return 1; }\n",
  "web/dep.ts": "export function dep(a: unknown) { return a; }\nexport function other() { return 1; }\n",
  "web/sample.ts": "import { dep as renamed, other } from './dep';\nimport type { T } from './types';\nimport fs from 'node:fs';\n\n/** doc */\n@sealed\nexport class Box<T> extends Base {\n  #secret = 1;\n  get size() { return other(); }\n  constructor(private n: number) { super(); }\n  put(a: string): void;\n  put(a: number): void;\n  put(a: any) { renamed(a); return this.go(); }\n  go() { return 2; }\n} // end of Box\n\nexport declare function ambient(x: string): void;\nexport function* gen() { for (const item of list()) { use(item); } try { risky(); } catch (e) { handle(e); } }\nconst arrow = async () => { const v = await load<string>('x'); return v; };\ninterface Shape { area(): number }\nexport abstract class Abs { abstract run(): void; }\nconst obj = { method() { return helper(); } };\n"
};

async function indexed() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'osg-lang-'));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(workspace, name)), { recursive: true });
    await writeFile(path.join(workspace, name), content);
  }
  const result = await scan(workspace);
  const symbols = new Map(result.facts.filter((fact) => fact.element_id.startsWith('code:symbol:')).map((fact) => [fact.element_id.slice('code:symbol:'.length), fact]));
  const edges = new Set(result.facts.filter((fact) => fact.src && fact.predicate !== 'contains').map((fact) =>
    `${fact.predicate} ${fact.src.replace(/^code:(?:file|symbol):/, '')} -> ${fact.dst.replace(/^code:(?:file|symbol):/, '')}`));
  return { workspace, result, symbols, edges };
}
const lines = (symbols, id) => [symbols.get(id).extent.ext_min[0], symbols.get(id).extent.ext_max[0]];

test('C#, C, C++, Ruby, PHP, Kotlin, Swift and Solidity declarations are found with qualified names', async () => {
  const { workspace, result, symbols } = await indexed();
  try {
    assert.deepEqual(result.warnings, []);
    for (const id of [
      'cs/Svc.cs#Svc', 'cs/Svc.cs#Svc.Run', 'cs/Svc.cs#Util.Twice', 'cs/Svc.cs#IFoo',
      'c/util.c#add', 'c/util.c#Point', 'cpp/widget.hpp#Widget', 'cpp/widget.hpp#Widget.draw', 'cpp/widget.cpp#Widget.paint', 'cpp/widget.cpp#helper',
      'rb/app.rb#Shop.Cart', 'rb/app.rb#Shop.Cart.add', 'rb/lib.rb#Lib.price',
      'php/src/App/Service.php#Service.run', 'php/src/App/Service.php#standalone', 'php/src/App/Util.php#Util.twice',
      'kt/com/acme/Main.kt#Main.run', 'kt/com/acme/Util.kt#Util.twice',
      'swift/App.swift#App.setup', 'swift/App.swift#Greeter', 'swift/App.swift#top',
      'sol/Token.sol#Token', 'sol/Token.sol#Token.mint', 'sol/Lib.sol#Lib.base'
    ]) assert.ok(symbols.has(id), id);
    assert.deepEqual(lines(symbols, 'cs/Svc.cs#Svc'), [3, 9]);
    assert.deepEqual(lines(symbols, 'rb/app.rb#Shop.Cart.add'), [4, 6]);
    assert.equal(symbols.get('cpp/widget.cpp#Widget.paint').kind, 'method');
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test('calls and imports resolve across files in the new languages', async () => {
  const { workspace, edges } = await indexed();
  try {
    for (const edge of [
      'calls cs/Svc.cs#Svc.Run -> cs/Svc.cs#Svc.Init', 'calls cs/Svc.cs#Svc.Run -> cs/Svc.cs#Util.Twice',
      'imports c/main.c -> c/util.h', 'calls c/main.c#main -> c/util.c#add', 'calls c/util.c#twice -> c/util.c#add',
      'imports cpp/widget.cpp -> cpp/widget.hpp', 'calls cpp/widget.hpp#Widget.draw -> cpp/widget.cpp#Widget.paint', 'calls cpp/widget.cpp#Widget.paint -> cpp/widget.cpp#helper',
      'imports rb/app.rb -> rb/lib.rb', 'calls rb/app.rb#Shop.Cart.add -> rb/app.rb#Shop.Cart.total', 'calls rb/app.rb#Shop.Cart.total -> rb/lib.rb#Lib.price',
      'imports php/src/App/Service.php -> php/src/App/Util.php', 'calls php/src/App/Service.php#Service.run -> php/src/App/Util.php#Util.twice',
      'calls php/src/App/Service.php#Service.run -> php/src/App/Service.php#Service.helper',
      'imports kt/com/acme/Main.kt -> kt/com/acme/Util.kt', 'calls kt/com/acme/Main.kt#Main.run -> kt/com/acme/Util.kt#Util.twice',
      'calls swift/App.swift#App.setup -> swift/App.swift#App.helper',
      'imports sol/Token.sol -> sol/Lib.sol', 'calls sol/Token.sol#Token.init -> sol/Lib.sol#Lib.base', 'calls sol/Token.sol#Token.mint -> sol/Token.sol#Token.onlyOwner',
      'imports web/a.tsx -> web/b.js', 'calls web/a.tsx#View -> web/b.js#b'
    ]) assert.ok(edges.has(edge), edge);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test('TypeScript and JavaScript follow the compiler-provider rules under Tree-sitter', async () => {
  const { workspace, result, symbols, edges } = await indexed();
  try {
    // Decorators and `export` belong to the declaration; a comment after the closing brace does not.
    assert.deepEqual(lines(symbols, 'web/sample.ts#Box'), [6, 15]);
    assert.deepEqual(lines(symbols, 'web/sample.ts#ambient'), [17, 17]);
    // Accessors, constructors and private fields are not declarations; for-of and catch variables are.
    for (const absent of ['Box.size', 'Box.constructor', 'Box.#secret']) assert.ok(!symbols.has(`web/sample.ts#${absent}`), absent);
    for (const present of ['item', 'e', 'v', 'arrow', 'Abs.run', 'method', 'Shape']) assert.ok(symbols.has(`web/sample.ts#${present}`), present);
    // Overload signatures are told apart by parameter types; the accessor's call belongs to the class.
    assert.equal([...symbols.keys()].filter((id) => id.startsWith('web/sample.ts#Box.put~')).length, 3);
    assert.ok(edges.has('imports web/sample.ts -> web/dep.ts'));
    assert.ok(edges.has('calls web/sample.ts#Box -> web/dep.ts#other'));
    assert.ok(edges.has('calls web/sample.ts#Box.put~' + [...symbols.keys()].find((id) => id.startsWith('web/sample.ts#Box.put~') && symbols.get(id).extent.ext_min[0] === 13).split('~')[1] + ' -> web/dep.ts#dep'));
    assert.ok(result.facts.every((fact) => !fact.element_id.includes('node_modules')));
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test('untrusted scan cache cannot inject foreign paths or fabricated same-file declarations', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'osg-scan-forgery-'));
  try {
    await writeFile(path.join(workspace, 'public.ts'), 'export const original = 1;\n');
    await mkdir(path.join(workspace, '.osg'), { recursive: true });
    await writeFile(path.join(workspace, '.osg', 'secret.ts'), 'export const privateMarker = 1;\n');
    let cache;
    const io = { load: async () => cache, save: async (value) => { cache = value; } };
    const cold = await scan(workspace, { cache: io });
    assert.equal(cold.files, 1);
    const withoutObservationTime = (facts) => facts.map(({ observed_at, valid_from, ...fact }) => fact);
    const forged = structuredClone(cache ?? { files: {} });
    forged.files ??= {};
    const entry = forged.files['public.ts'] ??= { info: { decls: [] } };
    entry.info.relative = '.osg/secret.ts';
    entry.info.decls.push({ name: 'forged', kind: 'function', start: 1, end: 1, signature: null, bodyHash: null, calls: [] });
    forged.generatedAt = Date.now() + 100_000;
    const injected = await scan(workspace, { cache: { load: async () => forged, save: async () => undefined } });
    assert.deepEqual(withoutObservationTime(injected.facts), withoutObservationTime(cold.facts));
    assert.ok(!JSON.stringify(injected.facts).includes('forged'));
    assert.ok(!JSON.stringify(injected.facts).includes('privateMarker'));
    const fabricated = structuredClone(forged);
    fabricated.files['public.ts'].info.relative = 'public.ts';
    assert.deepEqual(withoutObservationTime((await scan(workspace, { cache: { load: async () => fabricated, save: async () => undefined } })).facts), withoutObservationTime(cold.facts));
  } finally { await rm(workspace, { recursive: true, force: true }); }
});
