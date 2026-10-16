// Opt-in only: node tools/real-model-proof.mjs --download
// Build first. No npm install, lifecycle scripts, default-suite network, or permanent-store writes.
// Primary model card: https://huggingface.co/Xenova/all-MiniLM-L6-v2/blob/751bff37182d3f1213fa05d7196b954e230abad9/README.md
// Local loading: https://huggingface.co/docs/transformers.js/tutorials/node#optional-customization
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const launcher = path.join(repository, 'dist/cli/src/public.js');
const preload = new URL('./real-model-offline.mjs', import.meta.url).href;
const model = 'Xenova/all-MiniLM-L6-v2';
const revision = '751bff37182d3f1213fa05d7196b954e230abad9';
const weightHash = 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1';
const maxBytes = 32 * 1024 * 1024;
let executable = process.execPath;
const query = 'authenticate credentials';
const target = 'Validate account passwords';
const texts = [query, target, 'Forecast rainfall tomorrow', 'Sort alphabetical lists'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const emit = (label, value) => console.log(JSON.stringify({ label, ...value }));

/** Snapshot files and directories, refusing links; atime is deliberately excluded. */
async function snapshot(root) {
  const result = {};
  async function walk(relative) {
    const absolute = path.join(root, relative);
    const info = await lstat(absolute, { bigint: true });
    assert.ok(!info.isSymbolicLink(), `Unexpected link: ${relative}`);
    result[relative] = { type: info.isDirectory() ? 'directory' : 'file', mtimeNs: String(info.mtimeNs),
      ...(info.isFile() ? { bytes: Number(info.size), sha256: hash(await readFile(absolute)) } : {}) };
    if (info.isDirectory()) for (const name of (await readdir(absolute)).sort()) await walk(path.join(relative, name));
  }
  await walk('');
  return result;
}

/** Bound each process; a timeout terminates only its owned process tree on Windows. */
async function run(args, env) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['--import', preload, ...args], {
      cwd: repository, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
    });
    let stdout = '', stderr = '', failure;
    const kill = () => {
      if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      else child.kill('SIGKILL');
    };
    const timer = setTimeout(() => { failure = new Error('Owned proof process exceeded 130 seconds'); kill(); }, 130000);
    for (const [stream, collect] of [[child.stdout, (chunk) => { stdout += chunk; }], [child.stderr, (chunk) => { stderr += chunk; }]])
      stream.on('data', (chunk) => {
        collect(chunk.toString());
        if (stdout.length + stderr.length > 2 * 1024 * 1024) { failure = new Error('Proof output limit exceeded'); kill(); }
      });
    child.on('error', (error) => { failure = error; });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      if (failure) { reject(failure); return; }
      try {
        assert.equal(status, 0, `Child failed (${signal}): ${stdout}\n${stderr}`);
        const instrumentation = stderr.split('\n').filter((line) => line.startsWith('OSG_REAL_PROOF:'))
          .map((line) => JSON.parse(line.slice('OSG_REAL_PROOF:'.length)));
        assert.ok(instrumentation.length >= 1, 'Preload must report even for public launcher workers');
        for (const report of instrumentation) {
          assert.deepEqual(report.blocked, [], 'No attempted network calls');
          assert.equal(report.calibrated.length >= 8, true);
          assert.equal(report.disposed, report.pipelines.filter((item) => item.calls.length).length, 'Loaded inference resources disposed');
          for (const pipeline of report.pipelines) {
            assert.equal(pipeline.options.dtype, 'q8');
            assert.equal(pipeline.model, model);
            for (const call of pipeline.calls) assert.deepEqual(call.options, { pooling: 'mean', normalize: true });
          }
        }
        resolve({ status, elapsedMs: Date.now() - started, json: JSON.parse(stdout), instrumentation });
      } catch (error) { reject(error); }
    });
  });
}

/** The child uses the actual adapter, including batched inference and disposal. */
async function adapterProbe(directory) {
  const { loadEmbedder } = await import('../dist/cli/src/embedder.js');
  const { decodeIndex, nearest } = await import('../dist/core/src/embedding.js');
  const embedder = await loadEmbedder(directory, false);
  try {
    assert.equal(embedder.dimension, 384);
    assert.equal(embedder.id, `${model}@q8`);
    const vectors = await embedder.embed(texts);
    assert.equal(vectors.length, texts.length);
    const norms = vectors.map((vector) => {
      assert.equal(vector.length, 384);
      assert.ok([...vector].every(Number.isFinite));
      const norm = Math.hypot(...vector);
      assert.ok(Math.abs(norm - 1) < 1e-5);
      return norm;
    });
    const similarities = vectors.slice(1).map((vector) => vector.reduce((sum, value, i) => sum + value * vectors[0][i], 0));
    assert.ok(similarities[0] > Math.max(...similarities.slice(1)), 'Paraphrase target outranks both distractors');
    let nearestItems;
    try {
      const cache = path.dirname(directory);
      const index = decodeIndex(JSON.parse(await readFile(path.join(cache, 'vectors.json'), 'utf8')), await readFile(path.join(cache, 'vectors.bin')));
      assert.ok(index);
      nearestItems = nearest(index, vectors[0], 20);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    console.log(JSON.stringify({ runtime: process.version, model: embedder.id, norms, similarities,
      vectorSha256: hash(Buffer.concat(vectors.map((vector) => Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)))), nearest: nearestItems }));
  } finally { await embedder.close(); }
}

/** Acquire a closed data-file allowlist at the immutable revision, verifying Git blobs and LFS SHA-256. */
async function acquire(directory, evidence) {
  const started = Date.now();
  const deadline = AbortSignal.timeout(180000);
  let totalBytes = 0;
  async function get(url, limit) {
    const response = await fetch(url, { signal: AbortSignal.any([deadline, AbortSignal.timeout(45000)]), redirect: 'follow' });
    assert.equal(response.status, 200, `HTTP failure: ${url}`);
    const final = new URL(response.url);
    assert.equal(final.protocol, 'https:');
    assert.ok(final.hostname === 'huggingface.co' || final.hostname.endsWith('.huggingface.co') || final.hostname.endsWith('.hf.co'), 'Official model/CDN only');
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length; totalBytes += chunk.length;
      if (bytes > limit || totalBytes > maxBytes) { await response.body.cancel().catch(() => {}); throw new Error('Download byte cap exceeded'); }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  const metadataBytes = await get(`https://huggingface.co/api/models/${model}/revision/${revision}?blobs=true`, 256000);
  const metadata = JSON.parse(metadataBytes);
  assert.equal(metadata.sha, revision);
  assert.equal(metadata.cardData.license, 'apache-2.0');
  await writeFile(path.join(evidence, 'model-metadata.json'), metadataBytes, { flag: 'wx' });
  const artifacts = [];
  for (const name of ['README.md', 'config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'vocab.txt', 'onnx/model_quantized.onnx']) {
    const entry = metadata.siblings.find((item) => item.rfilename === name);
    assert.ok(entry && Number.isSafeInteger(entry.size) && entry.size <= maxBytes);
    if (name.endsWith('.onnx')) assert.equal(entry.lfs.sha256, weightHash);
    const url = `https://huggingface.co/${model}/resolve/${revision}/${name}`;
    const bytes = await get(url, entry.size);
    assert.equal(bytes.length, entry.size);
    const sha256 = hash(bytes);
    if (entry.lfs) assert.equal(sha256, entry.lfs.sha256);
    else assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), entry.blobId);
    const destination = name === 'README.md' ? path.join(evidence, 'model-card.md') : path.join(directory, model, name);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx' });
    artifacts.push({ name, bytes: bytes.length, sha256, url, gitBlob: entry.blobId });
    if (name === 'README.md') assert.match(bytes.toString(), /license: apache-2.0/);
  }
  return { model, revision, license: metadata.cardData.license, licenseEvidence: 'Pinned publisher model card; no standalone LICENSE in model repository. Not legal/distribution clearance.',
    totalBytes, elapsedMs: Date.now() - started, metadataSha256: hash(metadataBytes), artifacts };
}

/** One optional exact minimum-runtime acquisition, independently capped and pinned to official checksums. */
async function acquireNode22(root) {
  assert.equal(process.platform, 'win32');
  assert.equal(process.arch, 'x64');
  const name = 'node-v22.0.0-win-x64.zip';
  const expected = '32d639b47d4c0a651ff8f8d7d41a454168a3d4045be37985f9a810cf8cef6174';
  const url = `https://nodejs.org/dist/v22.0.0/${name}`;
  const started = Date.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(90000), redirect: 'error' });
  assert.equal(response.status, 200);
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 50 * 1024 * 1024) throw new Error('Runtime archive exceeds 50 MiB');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(hash(bytes), expected, 'Official SHASUMS256.txt archive hash');
  const archive = path.join(root, name);
  const runtime = path.join(root, 'runtime');
  await writeFile(archive, bytes, { flag: 'wx' });
  await mkdir(runtime);
  const extracted = spawnSync('tar.exe', ['-xf', archive, '-C', runtime, 'node-v22.0.0-win-x64/node.exe'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(extracted.status, 0, extracted.stderr);
  const node = path.join(runtime, 'node-v22.0.0-win-x64/node.exe');
  const version = spawnSync(node, ['--version'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), 'v22.0.0');
  emit('minimum-runtime', { url, checksumSource: 'https://nodejs.org/dist/v22.0.0/SHASUMS256.txt',
    archiveBytes: size, archiveSha256: expected, executableSha256: hash(await readFile(node)), version: version.stdout.trim(), elapsedMs: Date.now() - started });
  await rm(archive);
  return node;
}

/** Exercise public commands in an isolated workspace, then remove only this run's owned tree. */
async function main() {
  const args = process.argv.slice(2);
  assert.ok(JSON.stringify(args) === JSON.stringify(['--download']) || JSON.stringify(args) === JSON.stringify(['--download', '--node22']),
    'Explicit opt-in required: node tools/real-model-proof.mjs --download [--node22]');
  const root = await mkdtemp(path.join(tmpdir(), 'osg-real-model-'));
  const owner = randomUUID();
  const marker = path.join(root, 'owner');
  await writeFile(marker, owner, { flag: 'wx' });
  const workspace = path.join(root, 'workspace');
  const directory = path.join(workspace, '.osg/cache/models');
  const evidence = path.join(root, 'evidence');
  const env = { ...process.env, HF_HUB_DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1',
    HF_HOME: path.join(root, 'hf-home'), HF_HUB_CACHE: path.join(root, 'hf-cache'),
    TRANSFORMERS_CACHE: path.join(root, 'transformers-cache'), XDG_CACHE_HOME: path.join(root, 'xdg-cache'),
    NODE_COMPILE_CACHE: '', NODE_OPTIONS: '', OSG_REAL_PROOF_ROOT: root };
  const cli = async (...args) => {
    const result = await run([launcher, ...args, '--workspace', workspace, '--json'], env);
    assert.equal(result.instrumentation.length, 2, 'Both public launcher and backend worker must report');
    assert.equal(new Set(result.instrumentation.map(({ pid }) => pid)).size, 2);
    return result;
  };
  const packet = (result) => { assert.equal(result.json.ok, true, JSON.stringify(result.json)); return result; };
  const ranks = (result) => result.json.data.items.map(({ elementId, data, reason }) => ({ elementId, name: data.value.name, reason }));
  try {
    await mkdir(workspace); await mkdir(evidence);
    if (args.includes('--node22')) executable = await acquireNode22(root);
    await writeFile(path.join(workspace, 'guide.md'), '# Validate account passwords\n\n# Forecast rainfall tomorrow\n\n# Sort alphabetical lists\n');
    await writeFile(path.join(workspace, 'control.ts'), 'export function verifyPassword(value: string) { return value.length > 0; }\n');
    packet(await cli('init')); packet(await cli('sync'));
    const graphBefore = await snapshot(path.join(workspace, '.osg/store'));
    const baseline = packet(await cli('context', '--task', query, '--max-tokens', '4000'));
    assert.ok(!ranks(baseline).some((item) => item.name === target), 'Lexical baseline has no paraphrase target');
    const lexicalControl = packet(await cli('context', '--task', 'verifyPassword', '--max-tokens', '800'));
    const acquisition = await acquire(directory, evidence);
    emit('acquisition', acquisition);
    const modelBefore = await snapshot(directory);
    const first = await run([fileURLToPath(import.meta.url), '--adapter', directory], env);
    const second = await run([fileURLToPath(import.meta.url), '--adapter', directory], env);
    assert.deepEqual(second.json, first.json, 'Fresh-process local reload gives identical proof vectors');
    assert.deepEqual(await snapshot(directory), modelBefore, 'Adapter loads do not mutate model bytes or mtimes');
    emit('adapter-and-fresh-process-reload', { first, second });
    const embedded = packet(await cli('embed'));
    assert.equal(embedded.json.data.complete, true);
    const embedPipelines = embedded.instrumentation.flatMap((report) => report.pipelines);
    assert.equal(embedPipelines.length, 1);
    assert.equal(embedPipelines[0].remote, true, 'Only explicit embed permits remote models; tripwires still forbid network for this cached proof');
    assert.equal(embedPipelines[0].calls.length, 1);
    assert.ok(embedded.json.data.embedded >= 4);
    assert.deepEqual(await snapshot(path.join(workspace, '.osg/store')), graphBefore, 'Embed does not mutate graph');
    assert.deepEqual(await snapshot(directory), modelBefore, 'Explicit embed uses pre-acquired local artifacts unchanged');
    emit('public-embed', embedded);
    const before = await snapshot(root);
    const semantic = packet(await cli('context', '--task', query, '--max-tokens', '4000'));
    assert.deepEqual(await snapshot(root), before, 'Whole owned workspace/model/vector/graph bytes AND mtimes unchanged on context');
    const semanticPipelines = semantic.instrumentation.flatMap((report) => report.pipelines);
    assert.equal(semanticPipelines.length, 1);
    assert.equal(semanticPipelines[0].remote, false);
    assert.equal(semanticPipelines[0].calls.length, 1);
    const semanticRanks = ranks(semantic);
    const targetRank = semanticRanks.findIndex((item) => item.name === target);
    assert.ok(targetRank >= 0);
    assert.equal(semanticRanks[targetRank].reason.seed, 'meaning');
    for (const name of texts.slice(2)) {
      const distractorRank = semanticRanks.findIndex((item) => item.name === name);
      assert.ok(distractorRank < 0 || targetRank < distractorRank, `Target outranks ${name}`);
    }
    const scored = await run([fileURLToPath(import.meta.url), '--adapter', directory], env);
    assert.deepEqual(await snapshot(root), before, 'Scored local reload also pure');
    emit('retrieval', { query, expected: target, lexical: ranks(baseline), semantic: semanticRanks,
      scores: scored.json.nearest, instrumentation: semantic.instrumentation,
      readSnapshotSha256: hash(JSON.stringify(before)), readSnapshotEntries: Object.keys(before).length });
    for (const mode of ['missing', 'corrupt']) {
      const weights = path.join(directory, model, 'onnx/model_quantized.onnx');
      const held = path.join(root, 'held-weights.onnx');
      await rename(weights, held);
      if (mode === 'corrupt') await writeFile(weights, 'not an ONNX model');
      try {
        const state = await snapshot(root);
        const result = packet(await cli('context', '--task', 'verifyPassword', '--max-tokens', '800'));
        assert.deepEqual(result.json.warnings.map(({ code }) => code), ['VECTORS_UNAVAILABLE']);
        const failedPipelines = result.instrumentation.flatMap((report) => report.pipelines);
        assert.equal(failedPipelines.length, 1);
        assert.equal(failedPipelines[0].remote, false);
        assert.deepEqual(failedPipelines[0].calls, []);
        assert.deepEqual(result.json.data.items.map(({ elementId }) => elementId), lexicalControl.json.data.items.map(({ elementId }) => elementId));
        assert.ok(Math.ceil(JSON.stringify(result.json).length / 4) <= 800);
        assert.deepEqual(await snapshot(root), state, `${mode} model fallback never downloads/repairs/mutates`);
        emit(`${mode}-model-fallback`, { elapsedMs: result.elapsedMs, warnings: result.json.warnings, instrumentation: result.instrumentation,
          snapshotSha256: hash(JSON.stringify(state)), entries: Object.keys(state).length });
      } finally { if (mode === 'corrupt') await rm(weights); await rename(held, weights); }
    }
    const filesOnly = (entries) => Object.fromEntries(Object.entries(entries).filter(([, value]) => value.type === 'file'));
    assert.deepEqual(filesOnly(await snapshot(directory)), filesOnly(modelBefore), 'Complete artifact SHA-256 and file mtimes unchanged after probes; intentional renames change parent directory mtimes');
    const verified = packet(await cli('verify'));
    assert.deepEqual(await snapshot(path.join(workspace, '.osg/store')), graphBefore);
    emit('verified', verified.json);
    emit('limits', { network: 'Calibrated JS fetch, Transformers env.fetch, HTTP(S), socket/TLS/DNS/datagram tripwires in launcher and worker; not an OS firewall or native syscall interception.',
      retrieval: 'One predeclared small controlled example, not a general benefit guarantee.', runtime: first.json.runtime });
  } finally {
    assert.equal(await readFile(marker, 'utf8'), owner, 'Cleanup ownership marker');
    assert.equal(path.dirname(root), tmpdir());
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    await assert.rejects(lstat(root), { code: 'ENOENT' });
    emit('cleanup', { removed: true, ownedPrefix: 'osg-real-model-', processes: 'All awaited child processes exited; timeout kills only owned PID trees.' });
  }
}

if (process.argv[2] === '--adapter') await adapterProbe(process.argv[3]);
else await main();
