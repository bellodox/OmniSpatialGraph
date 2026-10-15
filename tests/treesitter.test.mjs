import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const cli = path.resolve('dist/cli/src/index.js');
const run = (workspace, ...args) => {
  const result = spawnSync(process.execPath, [cli, ...args, '--workspace', workspace, '--json'], { encoding: 'utf8' });
  return { status: result.status, json: JSON.parse(result.stdout) };
};
const files = {
  'app/util/helpers.py': 'def slugify(text):\n    cleaned = text.strip().lower().replace(" ", "-")\n    return cleaned\n',
  'app/service.py': 'from .util.helpers import slugify as make_slug\n\nclass Store:\n    def save(self, name):\n        key = make_slug(name)\n        self._write(key)\n        return key\n\n    def _write(self, key):\n        print("writing", key)\n\n    class Inner:\n        def deep(self):\n            return 1\n\n@decorator\ndef top_level(x):\n    def nested(y):\n        return y\n    return nested(x)\n',
  'svc/a.go': 'package svc\n\ntype Server struct{ port int }\ntype Handler interface{ Serve() }\n\nfunc New(port int) *Server { return &Server{port: port} }\n\nfunc (s *Server) Start() error {\n\ts.listen()\n\treturn helper()\n}\n\nfunc (s *Server) listen() {}\n',
  'svc/b.go': 'package svc\n\nfunc helper() error { return nil }\n',
  'src/main.rs': 'mod net;\nstruct Counter { n: u32 }\nenum Mode { A, B }\ntrait Run { fn run(&self); }\nimpl Counter {\n    fn new() -> Self { Counter { n: 0 } }\n    fn bump(&mut self) { self.n += 1; self.log(); Self::new(); }\n    fn log(&self) { println!("{}", self.n); }\n}\nfn main() { let mut c = Counter::new(); c.bump(); standalone(); }\nfn standalone() {}\n',
  'src/net/mod.rs': 'pub fn connect() {}\n',
  'java/com/acme/core/Util.java': 'package com.acme.core;\npublic class Util {\n    public static int twice(int x) { return x * 2; }\n}\n',
  'java/com/acme/app/Main.java': 'package com.acme.app;\nimport com.acme.core.Util;\npublic class Main {\n    private int count;\n    public Main() { reset(); }\n    public void run() { count = Util.twice(count); this.reset(); }\n    void reset() { count = 0; }\n    static class Helper { void help() {} }\n}\n',
  'svc/broken.py': 'def ok():\n    return 1\ndef broken(:\n    pass\n'
};
const sym = (file, name) => `code:symbol:${file}#${name}`;

async function fixture() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'osg-ts-'));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(workspace, name)), { recursive: true });
    await writeFile(path.join(workspace, name), content);
  }
  assert.equal(run(workspace, 'init').status, 0);
  return workspace;
}
// Items reachable from one entity, keyed by id with the edge that led to them.
const around = (workspace, id) => new Map(run(workspace, 'context', '--entity', id, '--max-tokens', '4000').json.data.items.map((item) => [item.elementId, item]));

test('Tree-sitter finds declarations with qualified names for Python, Go, Rust and Java', async () => {
  const workspace = await fixture();
  try {
    const synced = run(workspace, 'sync');
    assert.equal(synced.status, 0);
    const known = (file, name) => assert.ok(around(workspace, sym(file, name)).has(sym(file, name)), `${file}#${name}`);
    for (const [file, name] of [
      ['app/service.py', 'Store'], ['app/service.py', 'Store.save'], ['app/service.py', 'Store.Inner.deep'], ['app/service.py', 'top_level'],
      ['svc/a.go', 'Server'], ['svc/a.go', 'Handler'], ['svc/a.go', 'Server.Start'], ['svc/a.go', 'New'],
      ['src/main.rs', 'Counter'], ['src/main.rs', 'Mode'], ['src/main.rs', 'Run'], ['src/main.rs', 'Counter.bump'], ['src/main.rs', 'main'],
      ['java/com/acme/app/Main.java', 'Main'], ['java/com/acme/app/Main.java', 'Main.run'], ['java/com/acme/app/Main.java', 'Main.Helper.help'], ['java/com/acme/core/Util.java', 'Util.twice']
    ]) known(file, name);
    assert.ok(!around(workspace, sym('app/service.py', 'nested')).has(sym('app/service.py', 'nested')), 'nested functions are not declarations');
    const method = run(workspace, 'context', '--entity', sym('app/service.py', 'Store.save')).json.data.items[0];
    assert.equal(method.kind, 'method');
    assert.deepEqual([method.citation.startLine, method.citation.endLine], [4, 7]);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test('Tree-sitter calls resolve within a type, across files and across imports', async () => {
  const workspace = await fixture();
  try {
    assert.equal(run(workspace, 'sync').status, 0);
    const calls = (file, name, target) => {
      const found = around(workspace, sym(file, name)).get(target);
      assert.ok(found && found.reason.edge === 'calls', `${name} -> ${target}`);
    };
    calls('app/service.py', 'Store.save', sym('app/service.py', 'Store._write'));
    calls('app/service.py', 'Store.save', sym('app/util/helpers.py', 'slugify'));
    calls('svc/a.go', 'Server.Start', sym('svc/a.go', 'Server.listen'));
    calls('svc/a.go', 'Server.Start', sym('svc/b.go', 'helper'));
    calls('src/main.rs', 'Counter.bump', sym('src/main.rs', 'Counter.log'));
    calls('src/main.rs', 'Counter.bump', sym('src/main.rs', 'Counter.new'));
    calls('src/main.rs', 'main', sym('src/main.rs', 'standalone'));
    calls('java/com/acme/app/Main.java', 'Main.run', sym('java/com/acme/app/Main.java', 'Main.reset'));
    calls('java/com/acme/app/Main.java', 'Main.run', sym('java/com/acme/core/Util.java', 'Util.twice'));
    calls('java/com/acme/app/Main.java', 'Main.Main', sym('java/com/acme/app/Main.java', 'Main.reset'));
    const imports = (from, to) => assert.equal(around(workspace, `code:file:${from}`).get(`code:file:${to}`)?.reason.edge, 'imports', `${from} imports ${to}`);
    imports('app/service.py', 'app/util/helpers.py');
    imports('java/com/acme/app/Main.java', 'java/com/acme/core/Util.java');
    imports('src/main.rs', 'src/net/mod.rs');
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test('a file with syntax errors keeps the declarations that parsed and reports a warning', async () => {
  const workspace = await fixture();
  try {
    const synced = run(workspace, 'sync');
    assert.ok(synced.json.warnings.some((warning) => warning.code === 'PARSE_RECOVERED'));
    assert.ok(around(workspace, sym('svc/broken.py', 'ok')).has(sym('svc/broken.py', 'ok')));
    assert.equal(run(workspace, 'verify').status, 0);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test('body digests let an episode follow a Tree-sitter symbol that is renamed', async () => {
  const workspace = await fixture();
  try {
    assert.equal(run(workspace, 'sync').status, 0);
    const saved = run(workspace, 'remember', '--task', 'Slug rules', '--decision', 'Lowercase and dash', '--outcome', 'ok', '--entities', sym('app/util/helpers.py', 'slugify'));
    assert.equal(saved.status, 0);
    await writeFile(path.join(workspace, 'app/util/helpers.py'), files['app/util/helpers.py'].replace('def slugify', 'def make_slug_from'));
    await writeFile(path.join(workspace, 'app/service.py'), files['app/service.py'].replace('slugify as make_slug', 'make_slug_from as make_slug'));
    const synced = run(workspace, 'sync');
    assert.equal(synced.json.data.renamed, 1);
    assert.ok(around(workspace, sym('app/util/helpers.py', 'make_slug_from')).has(saved.json.data.episodeId));
  } finally { await rm(workspace, { recursive: true, force: true }); }
});
