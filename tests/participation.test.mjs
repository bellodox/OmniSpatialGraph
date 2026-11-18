// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../dist/storage-lance/src/index.js';
import {ParticipationGraph} from '../dist/core/src/participation.js';
import {WorldGraph} from '../dist/core/src/world.js';
import {commit,verify} from '../dist/core/src/graph.js';
import {createHash} from 'node:crypto';
const request=(id,extra={})=>({sessionId:'session',requestId:id,contextId:'run/0',activityId:id,action:'start',text:'Inspect contact',expectedVersion:null,...extra});
async function setup(){const dir=await mkdtemp(join(tmpdir(),'osg-participation-'));const store=await openStore(dir,true);return{dir,store,graph:new ParticipationGraph(store),async close(){store.close();await rm(dir,{recursive:true,force:true});}};}
test('independent peer requests survive native concurrent CAS, retain hypotheses and recover idempotency',async()=>{
 const x=await setup();let other;
 try{
  other=await openStore(x.dir);const b=new ParticipationGraph(other);
  const [a,c]=await Promise.all([x.graph.submit('A',request('a')),b.submit('B',request('b'))]);
  assert.notEqual(a.appliedHead,c.appliedHead);assert.equal((await x.graph.list()).items.length,2);
  const old=await x.graph.list({head:a.appliedHead});assert.ok(old.items.some(i=>i.actor==='A'));
  const update=request('note',{activityId:'a',action:'note',text:'Changed finding',expectedVersion:a.version});
  const n=await x.graph.submit('A',update);
  const retry=await b.submit('A',request('a'));assert.equal(retry.idempotent,true);assert.equal(retry.version,a.version);
  await assert.rejects(b.submit('A',request('a',{text:'Different payload'})),{code:'ACTIVITY_CONFLICT'});
  await assert.rejects(x.graph.submit('A',request('stale',{activityId:'a',action:'finish',expectedVersion:a.version})),{code:'ACTIVITY_CONFLICT'});
  const done=await x.graph.submit('A',request('finish',{activityId:'a',action:'finish',expectedVersion:n.version}));
  const items=(await new ParticipationGraph(other).list()).items;
  assert.equal(items.find(i=>i.actor==='A').state,'finished');assert.ok(items.every(i=>i.status==='hypothesis'&&i.untrusted));
  await assert.rejects(x.graph.submit('A',request('after',{activityId:'a',action:'note',expectedVersion:done.version})),{code:'ACTIVITY_CONFLICT'});
  verify(await x.store.rows());
 }finally{other?.close();await x.close();}
});
test('changed read dependencies conflict even with independent writes; absent guards detect new resources',async()=>{
 const x=await setup();try{
  const a=await x.graph.submit('A',request('a'));
  await x.graph.submit('B',request('b',{requires:[{elementId:a.activityId,version:a.version}]}));
  assert.ok((await x.store.rows()).some(r=>r.predicate==='used_version'&&r.dst===a.activityId));
  await x.graph.submit('A',request('update',{activityId:'a',action:'note',expectedVersion:a.version}));
  await assert.rejects(x.graph.submit('B',request('stale',{requires:[{elementId:a.activityId,version:a.version}]})),{code:'ACTIVITY_CONFLICT'});
  await assert.rejects(x.graph.submit('B',request('absent',{requires:[{elementId:a.activityId,version:null}]})),{code:'ACTIVITY_CONFLICT'});
  assert.equal((await x.graph.list({contextId:'unrelated'})).items.length,0);
 }finally{await x.close();}
});
test('world append retries unrelated peer publication without exposing or duplicating the sample',async()=>{
 const x=await setup();try{
  const bytes=new Map();let inject=true;
  const assets={async put(b){if(inject){inject=false;await x.graph.submit('agent',request('parallel'));}const id=createHash('sha256').update(b).digest('hex');bytes.set(id,b);return id;},async get(id){return bytes.get(id);}};
  const world=await WorldGraph.open(x.store,assets);
  const record={sequence:1,step:1,timeMicros:1,entityId:'vessel',frameId:'global',operation:'state',marked:false,payload:new Uint8Array([1,2,3])};
  await world.append('run',0,[record]);
  assert.equal(world.streams().streams[0].samples,1);assert.equal((await x.graph.list()).items.length,1);
  assert.equal((await world.append('run',0,[record])).idempotent,true);
  assert.equal(verify(await x.store.rows()).commits,2);
 }finally{await x.close();}
});
test('duplicate request published between another process head read and append-only key check resolves once',async()=>{
 const x=await setup();let other;try{
  other=await openStore(x.dir);let enter,release;
  const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  const delayed={...other,async publish(rows,head){enter();await gate;return other.publish(rows,head);}};
  const pending=new ParticipationGraph(delayed).submit('same-actor',request('same'));
  await entered;const first=await x.graph.submit('same-actor',request('same'));release();
  const retry=await pending;assert.equal(retry.idempotent,true);assert.equal(retry.version,first.version);
  assert.equal((await x.graph.list()).items.length,1);assert.equal(verify(await x.store.rows()).commits,1);
 }finally{other?.close();await x.close();}
});
