import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { openStore } from '../dist/storage-lance/src/index.js';
import { snapshot } from '../dist/core/src/graph.js';

const provider = pathToFileURL(path.resolve('dist/indexing-kilo/src/treesitter.js')).href;
const cli = path.resolve('dist/cli/src/index.js');
const responseBytes = 16 * 1024 * 1024;

// Replace only the owned Swift helper at the built-in boundary, without a production bypass.
// The fake streams deliver bounded chunks; no allocation approaches memory exhaustion.
function helperHook(mode, expectedRequests = 1) {
  return `import cp from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import { EventEmitter } from 'node:events';
    import { PassThrough, Writable } from 'node:stream';
    import assert from 'node:assert/strict';
    const original=cp.spawn; let starts=0, kills=0, requests=0;
    const timer=globalThis.setTimeout;
    globalThis.setTimeout=(fn,ms,...args)=>timer(fn,ms===60000?40:ms,...args);
    cp.spawn=function(executable,args,options) {
      if(!args.includes('--liftoff-only')) return original(executable,args,options);
      starts++;
      const child=new EventEmitter(); child.stdout=new PassThrough();
      child.kill=()=>{ kills++; child.stdout.destroy(); queueMicrotask(()=>child.emit('close',null,'SIGTERM')); return true; };
      child.stdin=new Writable({write(chunk,encoding,done) {
        const {id}=JSON.parse(chunk.toString()); requests++; done();
        queueMicrotask(()=>{
          const mode=${JSON.stringify(mode)};
          if(mode==='timeout') return;
          if(mode==='exit') { child.emit('close',17,null); return; }
          if(mode==='error') { child.emit('error',new Error('fixture spawn failure')); return; }
          if(mode==='stdin-error') { child.stdin.emit('error',new Error('fixture write failure')); return; }
          if(mode==='malformed') { child.stdout.write('{broken}\\n'); return; }
          if(mode==='utf8') { child.stdout.write(Buffer.from([0xff,10])); return; }
          if(mode==='oversize-single') { child.stdout.write(Buffer.alloc(16777217,32)); return; }
          if(mode==='oversize' || mode==='oversize-line') {
            for(let i=0;i<256&&!child.stdout.destroyed;i++) child.stdout.write(Buffer.alloc(65536,32));
            if(!child.stdout.destroyed) child.stdout.write(mode==='oversize-line'?'x\\n':'x');
            return;
          }
          let result={decls:[],imports:[],recovered:false};
          if(mode==='null') result=null;
          if(mode==='decl') result.decls=[{name:'broken',kind:'function',start:0,end:1,signature:null,bodyHash:null,calls:[]}];
          if(mode==='calls') result.decls=[{name:'broken',kind:'function',start:1,end:1,signature:null,bodyHash:null,calls:[17]}];
          if(mode==='imports') result.imports=[{mode:'file',specifier:'x',bindings:[{local:17,imported:'x'}]}];
          if(mode==='recovered') result.recovered='false';
          const reply=JSON.stringify({id:mode==='id'?id+1:id,result});
          if(mode==='boundary' || mode==='unicode' || mode==='unicode-over') {
            const unicode=mode.startsWith('unicode');
            const prefix=unicode?Buffer.from('é'.repeat(1024)):Buffer.alloc(0);
            const value=unicode?JSON.stringify({id,result,note:prefix.toString()}):reply;
            const bytes=Buffer.from(value), split=unicode?bytes.indexOf(0xc3)+1:31;
            child.stdout.write(bytes.subarray(0,split)); child.stdout.write(bytes.subarray(split));
            let padding=${responseBytes}-bytes.length+(mode==='unicode-over'?1:0);
            while(padding>0&&!child.stdout.destroyed) { const size=Math.min(padding,65536); child.stdout.write(Buffer.alloc(size,32)); padding-=size; }
            child.stdout.write('\\n'); return;
          }
          child.stdout.write(reply+'\\n');
        });
      }});
      return child;
    };
    syncBuiltinESMExports();
    process.on('exit',()=>{
      assert.equal(starts,1,'one child per scan/session');
      assert.equal(kills,1,'owned helper terminated exactly once');
      assert.equal(requests,${expectedRequests},'injection reached; oversized input is never sent');
    });`;
}

function injectedParse(mode, success = false, input = "'func value() {}'") {
  const script = `import assert from 'node:assert/strict';
    const {parseWithTreeSitter,closeParsers}=await import(${JSON.stringify(provider)});
    try {
      ${success ? `for(let i=0;i<2;i++) assert.deepEqual(await parseWithTreeSitter('swift',${input}),{decls:[],imports:[],recovered:false});`
        : `await Promise.all([1,2].map(()=>assert.rejects(parseWithTreeSitter('swift',${input}),{code:'SWIFT_PARSE_FAILED'})));`}
    } finally {closeParsers();}`;
  const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(helperHook(mode, success ? 2 : 1))}`, '--input-type=module', '-e', script],
    { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
}

for (const mode of ['oversize', 'oversize-line', 'oversize-single', 'unicode-over', 'malformed', 'utf8', 'null', 'decl', 'calls', 'imports', 'recovered', 'id', 'exit', 'error', 'stdin-error', 'timeout']) {
  test(`Swift helper rejects ${mode} promptly and terminates its child`, { timeout: 15000 }, () => injectedParse(mode));
}
for (const mode of ['empty', 'boundary', 'unicode']) {
  test(`Swift helper accepts ${mode} response and reuses one child`, { timeout: 15000 }, () => injectedParse(mode, true));
}

test('Swift helper bounds serialized input before sending it', { timeout: 15000 }, () => {
  // Keep a first small request so the termination and one-child assertions also apply.
  const script = `import assert from 'node:assert/strict';
    const {parseWithTreeSitter,closeParsers}=await import(${JSON.stringify(provider)});
    try {
      await parseWithTreeSitter('swift','func value() {}');
      await assert.rejects(parseWithTreeSitter('swift','\\0'.repeat(${responseBytes / 6} + 1)),{code:'SWIFT_PARSE_FAILED'});
    } finally {closeParsers();}`;
  const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(helperHook('empty'))}`, '--input-type=module', '-e', script],
    { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

function run(workspace, command, args = [], mode) {
  const result = spawnSync(process.execPath, [...(mode ? ['--import', `data:text/javascript,${encodeURIComponent(helperHook(mode))}`] : []),
    cli, command, '--workspace', workspace, ...args, '--json'], { encoding: 'utf8', timeout: 20000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.stdout.trim().split('\n').length, 1, result.stderr);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.ok, result.status === 0, result.stderr);
  return { exit: result.status, ...envelope };
}

test('Swift timeout terminates a real owned helper process', { timeout: 15000 }, () => {
  const script = `import assert from 'node:assert/strict';
    import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
    const original=cp.spawn, timer=globalThis.setTimeout; let child,closed;
    cp.spawn=(executable,args,options)=>{
      assert.ok(args.includes('--liftoff-only'));
      child=original(executable,['-e','setInterval(()=>{},1000)'],options);
      closed=new Promise(resolve=>child.once('close',resolve)); return child;
    };
    globalThis.setTimeout=(fn,ms,...args)=>timer(fn,ms===60000?40:ms,...args);
    syncBuiltinESMExports();
    const {parseWithTreeSitter,closeParsers}=await import(${JSON.stringify(provider)});
    try {
      await assert.rejects(parseWithTreeSitter('swift','func value() {}'),{code:'SWIFT_PARSE_FAILED'});
      await closed;
      assert.ok(child.killed); assert.ok(child.exitCode!==null||child.signalCode!==null);
      assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});
    } finally {closeParsers(); if(child&&!child.killed)child.kill('SIGKILL');}`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('unavailable grammars retain non-Swift fallback but abort Swift scans', { timeout: 15000 }, async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'osg-swift-unavailable-'));
  try {
    await writeFile(path.join(workspace, 'value.py'), 'def value():\n    return 1\n');
    const script = `import assert from 'node:assert/strict';
      import Module from 'node:module'; import {writeFile} from 'node:fs/promises';
      const original=Module._load;
      Module._load=function(name,...args){if(name==='@vscode/tree-sitter-wasm')throw Error('fixture unavailable');return original.call(this,name,...args);};
      const {scan}=await import(${JSON.stringify(pathToFileURL(path.resolve('dist/indexing-kilo/src/index.js')).href)});
      const root=${JSON.stringify(workspace)}, fallback=await scan(root);
      assert.ok(fallback.facts.some(fact=>fact.element_id==='code:symbol:value.py#value'));
      assert.ok(fallback.warnings.some(warning=>warning.code==='TREE_SITTER_UNAVAILABLE'));
      await writeFile(root+'/value.swift','func value() {}');
      await assert.rejects(scan(root),{code:'SWIFT_PARSE_FAILED'});`;
    const result = spawnSync(process.execPath, ['--liftoff-only', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test('public Swift failure preserves its safe error contract, graph state and process cleanup', { timeout: 90000 }, async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'osg-swift-public-'));
  const symbol = 'code:symbol:value.swift#value';
  const secret = 'private-swift-helper-marker';
  let store;
  try {
    await writeFile(path.join(workspace, 'value.swift'), 'func value() -> Int { return 42 }\n');
    assert.equal(run(workspace, 'init').exit, 0);
    assert.equal(run(workspace, 'sync').exit, 0);
    const saved = run(workspace, 'remember', ['--task', 'Swift public boundary', '--decision', 'retain links', '--outcome', 'fixture', '--entities', symbol]);
    assert.equal(saved.exit, 0);
    store = await openStore(path.join(workspace, '.osg/store'));
    const before = await store.rows();
    const head = await store.head('main');
    const visible = snapshot(before, head).state;
    const about = [...visible.values()].find((row) => row.predicate === 'about' && row.src === saved.data.episodeId && row.dst === symbol);
    assert.ok(visible.has(symbol));
    assert.ok(about, 'episode is genuinely linked before public failures');
    await writeFile(path.join(workspace, 'value.swift'), 'func value() -> Int { return 43 }\n');
    for (const mode of ['malformed', 'exit']) {
      const cleanup = path.join(workspace, `${mode}-cleanup.json`);
      const helper = `process.stderr.write(${JSON.stringify(`${secret} ${workspace}`)}); ${mode === 'malformed'
        ? `process.stdout.write(${JSON.stringify(`{broken ${secret} ${workspace}\n`)}); setInterval(()=>{},1000);`
        : 'process.exit(17);'}`;
      const hook = `import cp from 'node:child_process';
        import {syncBuiltinESMExports} from 'node:module'; import {writeFileSync} from 'node:fs';
        const original=cp.spawn;
        cp.spawn=(executable,args,options)=>{
          if(!args.includes('--liftoff-only')) return original(executable,args,options);
          const child=original(executable,['-e',${JSON.stringify(helper)}],options);
          child.once('close',(code,signal)=>writeFileSync(${JSON.stringify(cleanup)},JSON.stringify({pid:child.pid,code,signal})));
          return child;
        }; syncBuiltinESMExports();`;
      const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(hook)}`,
        path.resolve('dist/cli/src/public.js'), 'sync', '--workspace', workspace, '--json'],
      { encoding: 'utf8', timeout: 20000 });
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.equal(result.stdout.trim().split('\n').length, 1);
      const failed = JSON.parse(result.stdout);
      assert.equal(result.status, 1, mode);
      assert.equal(failed.ok, false);
      assert.deepEqual(failed.error, { code: 'SWIFT_PARSE_FAILED', category: 'internal',
        message: 'Swift extraction failed; scan aborted before committing', retryable: false, details: {} });
      assert.equal(failed.data, null);
      assert.equal(failed.graphCommitId, head);
      assert.match(result.stderr, /SWIFT_PARSE_FAILED: Swift extraction failed; scan aborted before committing/);
      assert.doesNotMatch(result.stdout + result.stderr, /invalid result|may have completed|CLI worker|Swift helper|\{broken/);
      assert.ok(!(result.stdout + result.stderr).includes(secret));
      assert.ok(!(result.stdout + result.stderr).includes(workspace));
      const closed = JSON.parse(await readFile(cleanup, 'utf8'));
      assert.ok(closed.code !== null || closed.signal !== null, 'owned real helper closed');
      assert.throws(() => process.kill(closed.pid, 0), { code: 'ESRCH' });
      assert.equal(await store.head('main'), head);
      assert.deepEqual(await store.rows(), before, `${mode}: no element or commit publication`);
      const state = snapshot(await store.rows(), head).state;
      for (const id of [symbol, about.element_id, saved.data.episodeId]) assert.deepEqual(state.get(id), visible.get(id));
    }
  } finally {
    store?.close?.();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('Swift failed sync preserves all rows, head, symbols and episode links; recovery and genuine deletion reconcile', { timeout: 90000 }, async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'osg-swift-preserve-'));
  const file = path.join(workspace, 'value.swift');
  const symbol = 'code:symbol:value.swift#value';
  let store;
  try {
    await writeFile(file, 'func value() -> Int { return 42 }\n');
    assert.equal(run(workspace, 'init').exit, 0);
    assert.equal(run(workspace, 'sync').exit, 0, 'real Swift grammar must be available, not skipped');
    store = await openStore(path.join(workspace, '.osg/store'));
    assert.ok(snapshot(await store.rows(), await store.head('main')).state.has(symbol));
    const saved = run(workspace, 'remember', ['--task', 'Swift preservation', '--decision', 'retain links', '--outcome', 'fixture', '--entities', symbol]);
    assert.equal(saved.exit, 0);
    const before = await store.rows();
    const head = await store.head('main');
    const visible = snapshot(before, head).state;
    const about = [...visible.values()].find((row) => row.predicate === 'about' && row.src === saved.data.episodeId && row.dst === symbol);
    assert.ok(about, 'episode is genuinely linked before failures');
    await writeFile(file, '\nfunc value() -> Int { return 43 }\n');
    for (const mode of ['oversize', 'oversize-line', 'malformed', 'null', 'decl', 'exit', 'timeout']) {
      const failed = run(workspace, 'sync', [], mode);
      assert.notEqual(failed.exit, 0, mode);
      assert.equal(failed.error.code, 'SWIFT_PARSE_FAILED', mode);
      assert.equal(failed.data, null);
      assert.equal(await store.head('main'), head, mode);
      assert.deepEqual(await store.rows(), before, `${mode}: no graph row or commit publication`);
      const state = snapshot(await store.rows(), head).state;
      assert.deepEqual(state.get(symbol), visible.get(symbol));
      assert.deepEqual(state.get(about.element_id), about);
      assert.deepEqual(state.get(saved.data.episodeId), visible.get(saved.data.episodeId));
    }
    const recovered = run(workspace, 'sync');
    assert.equal(recovered.exit, 0);
    const recoveredState = snapshot(await store.rows(), await store.head('main')).state;
    assert.ok(recoveredState.has(symbol));
    assert.deepEqual(recoveredState.get(about.element_id), about, 'successful real parse retains original about link');
    // A real successful empty parse is deletion, unlike helper failure.
    await writeFile(file, '// symbol deliberately removed\n');
    const empty = run(workspace, 'sync');
    assert.equal(empty.exit, 0);
    let state = snapshot(await store.rows(), await store.head('main')).state;
    assert.ok(!state.has(symbol));
    assert.ok(!state.has(about.element_id));
    assert.ok(state.has(saved.data.episodeId));
    assert.ok(state.has('code:file:value.swift'));
    await rm(file);
    assert.equal(run(workspace, 'sync').exit, 0);
    state = snapshot(await store.rows(), await store.head('main')).state;
    assert.ok(!state.has('code:file:value.swift'));
    assert.ok(state.has(saved.data.episodeId));
    assert.equal(run(workspace, 'history', ['--entity', symbol]).data.current, false);
    assert.equal(run(workspace, 'verify').exit, 0);
  } finally {
    store?.close?.();
    await rm(workspace, { recursive: true, force: true });
  }
});
