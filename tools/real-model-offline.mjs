// Opt-in proof instrumentation, not a security sandbox or OS firewall.
// module.register is available on Node 22.0; real inference is never substituted.
import { register, syncBuiltinESMExports } from 'node:module';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import dgram from 'node:dgram';
import childProcess from 'node:child_process';

const writeReport = process.stderr.write.bind(process.stderr);
const report = globalThis.__osgRealProof = { pid: process.pid, blocked: [], pipelines: [], disposed: 0, calibrated: [] };
function deny(api) {
  return () => { report.blocked.push(api); throw new Error(`OFFLINE_TRIPWIRE:${api}`); };
}
globalThis.fetch = deny('global.fetch');
for (const [name, module, methods] of [
  ['http', http, ['request', 'get']], ['https', https, ['request', 'get']],
  ['net', net, ['connect', 'createConnection']], ['tls', tls, ['connect']],
  ['dns', dns, ['lookup', 'resolve', 'resolve4', 'resolve6']],
  ['dns.promises', dns.promises, ['lookup', 'resolve', 'resolve4', 'resolve6']],
  ['dgram', dgram, ['createSocket']]
]) for (const method of methods) module[method] = deny(`${name}.${method}`);
net.Socket.prototype.connect = deny('net.Socket.connect');
syncBuiltinESMExports();

// Calibrate representative paths, then require zero attempts during the actual operation.
for (const [name, call] of [
  ['fetch', () => fetch('https://huggingface.co')], ['http', () => http.request('http://huggingface.co')],
  ['https', () => https.get('https://huggingface.co')], ['socket', () => new net.Socket().connect(443, 'huggingface.co')],
  ['tls', () => tls.connect(443, 'huggingface.co')], ['dns', () => dns.lookup('huggingface.co')],
  ['dns.promises', () => dns.promises.resolve('huggingface.co')], ['dgram', () => dgram.createSocket('udp4')]
]) {
  try { call(); throw new Error(`Tripwire did not fire: ${name}`); }
  catch (error) { if (!error.message.startsWith('OFFLINE_TRIPWIRE:')) throw error; report.calibrated.push(name); }
}
report.blocked.length = 0;

// Observe real pipeline options/disposal, and cover the library's configurable fetch path too.
// Only the adapter's dependency import is wrapped; the installed library and ONNX runtime execute unchanged.
const actual = import.meta.resolve('@huggingface/transformers');
const wrapper = `import * as actual from ${JSON.stringify(actual)};
  export const env = actual.env;
  env.fetch = () => { globalThis.__osgRealProof.blocked.push('transformers.env.fetch'); throw new Error('OFFLINE_TRIPWIRE:transformers.env.fetch'); };
  try { env.fetch('https://huggingface.co'); } catch (error) {
    if (!error.message.startsWith('OFFLINE_TRIPWIRE:')) throw error;
    globalThis.__osgRealProof.calibrated.push('transformers.env.fetch');
    globalThis.__osgRealProof.blocked.pop();
  }
  export async function pipeline(...args) {
    const report = globalThis.__osgRealProof;
    const record = { task: args[0], model: args[1], options: args[2], calls: [],
      remote: env.allowRemoteModels, cacheDir: env.cacheDir, localModelPath: env.localModelPath };
    report.pipelines.push(record);
    const extractor = await actual.pipeline(...args);
    const wrapped = async (texts, options) => { record.calls.push({ batch: texts.length, options }); return extractor(texts, options); };
    wrapped.dispose = async () => { await extractor.dispose(); report.disposed++; };
    return wrapped;
  }`;
const wrapperUrl = `data:text/javascript,${encodeURIComponent(wrapper)}`;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(specifier, context, next) {
  if (specifier === '@huggingface/transformers' && context.parentURL?.endsWith('/cli/src/embedder.js'))
    return { url: ${JSON.stringify(wrapperUrl)}, shortCircuit: true };
  return next(specifier, context);
}`)}`);

// Public CLI isolates worker stderr. Mirror only our bounded machine-readable instrumentation, not diagnostics.
const originalFork = childProcess.fork;
childProcess.fork = function (...args) {
  const worker = originalFork.apply(this, args);
  let pending = '';
  worker.stderr?.on('data', (chunk) => {
    pending += chunk.toString();
    const lines = pending.split('\n'); pending = lines.pop();
    for (const line of lines) if (line.startsWith('OSG_REAL_PROOF:')) process.stderr.write(`${line}\n`);
    if (pending.length > 65536) pending = '';
  });
  return worker;
};
syncBuiltinESMExports();
process.on('exit', () => writeReport(`OSG_REAL_PROOF:${JSON.stringify(report)}\n`));
