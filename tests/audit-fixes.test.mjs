// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {openStore} from '../dist/storage-lance/src/index.js';import {WorldGraph} from '../dist/core/src/world.js';import {ParticipationGraph} from '../dist/core/src/participation.js';import {commit,reach} from '../dist/core/src/graph.js';import {hash} from '../dist/core/src/hash.js';
const request={sessionId:'s',requestId:'r',contextId:'ctx',activityId:'task',action:'start',text:'Start',expectedVersion:null};
async function setup(){const dir=await mkdtemp(join(tmpdir(),'osg-audit-fix-')),store=await openStore(dir,true);return{dir,store,async close(){store.close();await rm(dir,{recursive:true,force:true});}};}
test('losing CAS activity commits cannot be selected as accepted history',async()=>{
 const x=await setup();let other,release;try{
  other=await openStore(x.dir);let enter;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  const delayed={...other,async publish(rows,head){enter();await gate;return other.publish(rows,head);}};
  const id=`shared:activity:${hash({actor:'A',contextId:'ctx',activityId:'task'})}`;
  const pending=new ParticipationGraph(delayed).submit('B',{...request,requires:[{elementId:id,version:null}]}).catch(e=>e);
  await entered;await new ParticipationGraph(x.store).submit('A',request);release();assert.equal((await pending).code,'ACTIVITY_CONFLICT');
  const rows=await x.store.rows(),head=await x.store.head('main'),commits=new Map(rows.filter(r=>r.row_type==='commit').map(r=>[r.commit_id,r]));
  const orphan=[...commits.keys()].find(id=>!reach(commits,head).has(id));assert.ok(orphan);
  await assert.rejects(new ParticipationGraph(x.store).list({head:orphan}),/not accepted/);
  const world=await WorldGraph.open(x.store,{put:async()=>'',get:async()=>new Uint8Array()});
  await assert.rejects(world.read({runId:'run',epoch:0,head:orphan}),/not accepted/);
 }finally{release?.();other?.close();await x.close();}
});
test('activity enumeration pages all 273 rows at one head, with active filter and exact actor lookup',async()=>{
 const x=await setup();try{
  const facts=Array.from({length:273},(_,i)=>({element_id:'shared:activity:'+i.toString(16).padStart(64,'0'),kind:'shared_activity',op:'assert',status:'hypothesis',props:{activityId:'task'+i,contextId:'ctx',actor:'peer'+i,text:'Finding',state:i%2?'active':'finished'},src:null,dst:null,predicate:null,extent:null,source_hash:null,valid_from:null,valid_to:null,observed_at:null}));
  await commit(x.store,facts,'fixture');const peers=new ParticipationGraph(x.store),first=await peers.list();assert.equal(first.items.length,256);assert.ok(first.nextAfter);
  await peers.submit('new-peer',request);
  const second=await peers.list({head:first.head,after:first.nextAfter});assert.equal(second.items.length,17);assert.equal(second.nextAfter,null);
  assert.equal(new Set([...first.items,...second.items].map(i=>i.elementId)).size,273);
  assert.equal((await peers.list({actor:'peer17',activityId:'task17'})).items.length,1);
  assert.ok((await peers.list({state:'active'})).items.every(i=>i.state==='active'));
 }finally{await x.close();}
});
test('long marked history remains paged and sparse latest-state reads skip unrelated assets',async()=>{
 const x=await setup();try{
  const values=new Map();let gets=0;const assets={async put(bytes){const id=createHash('sha256').update(bytes).digest('hex');values.set(id,bytes);return id;},async get(id){gets++;return values.get(id);}};
  const world=await WorldGraph.open(x.store,assets);
  for(let i=1;i<=18;i++)await world.append('run',0,[{sequence:i,step:i,timeMicros:i,entityId:i===1?'static':'moving',frameId:'global',operation:'state',marked:true,payload:new Uint8Array(2*1024*1024)}]);
  gets=0;const state=await world.read({runId:'run',epoch:0});assert.equal(state.records.length,2);assert.equal(gets,2);
  const seen=[];let cursor,head;
  do{const page=await world.markedPage({runId:'run',epoch:0,head,direction:'forward',fromSequence:cursor,limit:3});head=page.head;seen.push(...page.records.map(r=>r.sequence));cursor=page.nextSequence;}while(cursor!==null);
  assert.deepEqual(seen,Array.from({length:18},(_,i)=>i+1));
  const recent=await world.markedPage({runId:'run',epoch:0,limit:2});assert.deepEqual(recent.records.map(r=>r.sequence),[18,17]);assert.equal(recent.nextSequence,16);
 }finally{await x.close();}
});
test('shared-handle writers reuse acknowledged views but separately opened writers force verified reloads',async()=>{
 const x=await setup();let other;try{
  let fullReads=0;const store={...x.store,async rows(){fullReads++;return x.store.rows();}};
  const bytes=new Map(),assets={async put(b){const id=createHash('sha256').update(b).digest('hex');bytes.set(id,b);return id;},async get(id){return bytes.get(id);}};
  const world=await WorldGraph.open(store,assets),peers=new ParticipationGraph(store),coldReads=fullReads;
  for(let sequence=1;sequence<=8;sequence++){
   await world.append('run',0,[{sequence,step:sequence,timeMicros:sequence,entityId:'vessel',frameId:'global',operation:'state',marked:false,payload:new Uint8Array([sequence])}]);
   await peers.submit('peer',{...request,requestId:'request'+sequence,activityId:'activity'+sequence});await world.refresh();
  }
  assert.equal(fullReads,coldReads);assert.equal(world.streams().streams[0].samples,8);assert.equal((await peers.list()).items.length,8);
  other=await openStore(x.dir);await new ParticipationGraph(other).submit('outside',{...request,requestId:'external'});
  await world.refresh();assert.ok(fullReads>coldReads);assert.equal((await peers.list()).items.length,9);
  const head=world.revision.head,again=await WorldGraph.open(store,assets);assert.equal(again.revision.head,head);
 }finally{other?.close();await x.close();}
});
