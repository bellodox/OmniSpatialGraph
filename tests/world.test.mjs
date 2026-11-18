// Copyright 2026 Vlad Bellomorski
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldGraph,encodeWorldRecords,decodeWorldRecords} from '../dist/core/src/world.js';
import {verify} from '../dist/core/src/graph.js';
import {openStore} from '../dist/storage-lance/src/index.js';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const rec=(sequence,time=sequence,entityId='vessel-A',operation='state')=>({sequence,step:sequence,timeMicros:time,entityId,frameId:'frame:global',operation,marked:sequence===2,payload:new Uint8Array(new Float64Array([1e11+sequence/100,sequence]).buffer)});
async function setup(){
 const dir=await mkdtemp(join(tmpdir(),'osg-world-')),store=await openStore(join(dir,'graph'),true);
 await mkdir(join(dir,'assets'));
 const assets={async put(b){const id=hash(b);await writeFile(join(dir,'assets',id),b);return id;},async get(id){return new Uint8Array(await readFile(join(dir,'assets',id)));}};
 return {dir,store,assets,async close(){store.close();await rm(dir,{recursive:true,force:true});}};
}
test('binary world segments preserve floating payload bytes and reject truncation, gaps and unsafe metadata',()=>{
 const a=rec(1),b=rec(2);assert.deepEqual(decodeWorldRecords(encodeWorldRecords([a,b])),[a,b]);
 assert.throws(()=>encodeWorldRecords([a,rec(3)]));assert.throws(()=>decodeWorldRecords(encodeWorldRecords([a]).slice(0,-1)));
 assert.throws(()=>encodeWorldRecords([{...a,timeMicros:.5}]));assert.throws(()=>encodeWorldRecords([{...a,payload:new Uint8Array(4*1024*1024)}]));
});
test('real Lance world temporal queries, head pinning, epochs, deletion, late retries and cold reopen',async()=>{
 const x=await setup();try{
  let world=await WorldGraph.open(x.store,x.assets);let notices=[];const stop=world.subscribe(r=>notices.push(r));
  const a=await world.append('run',0,[rec(1,10),rec(2,20,'vessel-B')]);
  const b=await world.append('run',0,[rec(3,30),rec(4,40,'vessel-B','delete')]);
  assert.equal((await world.read({runId:'run',epoch:0,head:a.head})).records.length,2);
  assert.equal((await world.read({runId:'run',epoch:0,timeMicros:25})).records[0].sequence,1);
  assert.deepEqual((await world.read({runId:'run',epoch:0})).records.map(r=>r.sequence),[3]);
  assert.equal((await world.read({runId:'run',epoch:0,timeMicros:0})).records.length,0);
  assert.equal(world.entities().entities.length,2);
  assert.equal(world.entities().entities.find(e=>e.entityId==='vessel-B').deleted,true);
  const rows=await x.store.rows();assert.ok(rows.some(r=>r.kind==='world_relation'&&r.predicate==='in_frame'));
  assert.equal((await world.append('run',0,[rec(1,10),rec(2,20,'vessel-B')])).idempotent,true);
  assert.equal(world.revision.head,b.head);
  await world.append('run',1,[rec(1,0)]);stop();assert.equal(notices.length,3);
  world=await WorldGraph.open(x.store,x.assets);
  assert.equal(world.streams().streams.length,2);
  assert.equal((await world.read({runId:'run',epoch:0,head:a.head})).records.length,2);
  assert.equal(verify(await x.store.rows()).commits,3);
  const marked=await world.marked({runId:'run',epoch:0,head:a.head});assert.equal(marked.records.length,1);assert.equal(marked.records[0].sequence,2);
  assert.equal((await world.marked({runId:'run',epoch:0,timeMicros:15})).records.length,0);
  await writeFile(join(x.dir,'assets',a.assetHash),'corrupt');
  await assert.rejects(world.read({runId:'run',epoch:0,head:a.head}),/hash mismatch/);
 }finally{await x.close();}
});
test('readers retain committed state during publication and caller byte mutations cannot alter it',async()=>{
 const x=await setup();try{
  let release,entered;const ready=new Promise(r=>entered=r),block=new Promise(r=>release=r);
  const assets={...x.assets,async put(b){entered();await block;return x.assets.put(b);}};
  const world=await WorldGraph.open(x.store,assets),r=rec(1),original=r.payload.slice();
  const write=world.append('run',0,[r]);r.payload.fill(0);await ready;
  assert.equal(world.revision.head,'ROOT');assert.equal((await world.read({runId:'run',epoch:0})).records.length,0);
  release();await write;
  assert.deepEqual((await world.read({runId:'run',epoch:0})).records[0].payload,original);
 }finally{await x.close();}
});
test('simultaneous clients get explicit conflicts; separate sessions refresh and preserve physics namespace',async()=>{
 const x=await setup();let second;try{
  const a=await WorldGraph.open(x.store,x.assets);await a.append('run',0,[rec(1)]);
  second=await openStore(join(x.dir,'graph'));const b=await WorldGraph.open(second,x.assets);
  const head=a.revision.head;
  const result=await Promise.allSettled([a.annotate('browser-A','note',{text:'one',status:'approved'},head),b.annotate('agent-B','note',{text:'two'},head)]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(result.find(r=>r.status==='rejected').reason.code,'STALE_HEAD');
  await a.refresh();await b.refresh();assert.equal(a.revision.head,b.revision.head);
  assert.equal(a.annotations().items.length,1);assert.equal(a.annotations().items[0].status,'hypothesis');
  assert.equal(a.annotations().items[0].untrusted,true);
  const earlier=await a.read({runId:'run',epoch:0,head});assert.equal(earlier.records[0].sequence,1);
  const latest=a.revision.head;
  const pending=[a.annotate('agent-A','a',{text:'A'},latest),a.annotate('agent-B','b',{text:'B'},latest)];
  const rr=await Promise.allSettled(pending);assert.equal(rr.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await a.read({runId:'run',epoch:0})).records[0].sequence,1);
  assert.doesNotThrow(()=>verify);verify(await x.store.rows());
 }finally{second?.close();await x.close();}
});
