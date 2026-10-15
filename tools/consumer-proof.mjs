import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Rebuild exactly the human-designated private consumer; never sweep the temp directory.
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = 'C:/Users/VSCode/AppData/Local/Temp';
const consumer = path.resolve(temporary, 'osg-independent-consumer-final');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
assert.equal(manifest.name, 'omnispatialgraph');
assert.equal(manifest.version, '0.1.0-prototype.0');
assert.equal(manifest.private, true);
assert.equal(manifest.license, 'Apache-2.0');
assert.equal(path.dirname(consumer), path.resolve(temporary));
assert.equal(path.basename(consumer), 'osg-independent-consumer-final');
assert.equal((await realpath(temporary)).toLowerCase(), path.resolve(temporary).toLowerCase());
const archive = path.join(temporary, `${manifest.name}-${manifest.version}.tgz`);

function command(executable, args, cwd = root, expected = 0, env = process.env) {
  const result = spawnSync(executable, args, { cwd, env, encoding: 'utf8', timeout: 300000,
    maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, expected, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}

function npm(args, cwd = root, expected = 0) {
  return command(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npm ${args}`], cwd, expected);
}

async function sha256(target) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(target)) hash.update(chunk);
  return hash.digest('hex');
}

// Refuse an unfamiliar directory, linked root, or consumer pointed at any other artifact.
try {
  const stat = await lstat(consumer);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  assert.equal((await realpath(consumer)).toLowerCase(), consumer.toLowerCase());
  assert.deepEqual((await readdir(consumer)).sort(), ['node_modules', 'package-lock.json', 'package.json']);
  const previous = JSON.parse(await readFile(path.join(consumer, 'package.json'), 'utf8'));
  assert.equal(previous.dependencies.omnispatialgraph, 'file:../omnispatialgraph-0.1.0-prototype.0.tgz');
  const installed = JSON.parse(await readFile(path.join(consumer, 'node_modules/omnispatialgraph/package.json'), 'utf8'));
  assert.equal(installed.name, manifest.name);
  assert.equal(installed.version, manifest.version);
  assert.equal(installed.private, true);
  assert.equal(installed.license, 'Apache-2.0');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // A partial preexisting consumer is not ownership evidence.
  await assert.rejects(lstat(consumer), { code: 'ENOENT' });
}
try {
  const stat = await lstat(archive);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
  const previous = JSON.parse(command('tar', ['-xOf', archive, 'package/package.json']).stdout);
  assert.equal(previous.name, manifest.name);
  assert.equal(previous.version, manifest.version);
  assert.equal(previous.private, true);
  assert.ok(['UNLICENSED', 'Apache-2.0'].includes(previous.license));
  console.log(JSON.stringify({ replacingOwnedArchive: archive, previousSha256: await sha256(archive) }));
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const packed = JSON.parse(npm(`pack --json --pack-destination ${temporary}`).stdout)[0];
assert.equal(packed.filename, path.basename(archive));
const archivePlatforms = [...new Set(packed.files.map((file) => /node_modules\/@lancedb\/(lancedb-[^/]+)\/package\.json$/.exec(file.path)?.[1]).filter(Boolean))].sort();
assert.deepEqual(archivePlatforms, ['lancedb-win32-x64-msvc']);
const archiveLance = JSON.parse(command('tar', ['-xOf', archive, 'package/node_modules/@lancedb/lancedb/package.json']).stdout);
const declaredPlatforms = Object.entries(archiveLance.optionalDependencies).filter(([name]) => name.startsWith('@lancedb/lancedb-'));
assert.equal(archiveLance.version, '0.40.0');
assert.equal(declaredPlatforms.length, 7);
assert.ok(declaredPlatforms.every(([, version]) => version === '0.40.0'));
const ownFiles = packed.files.map((file) => file.path).filter((name) => !name.startsWith('node_modules/'));
assert.ok(ownFiles.includes('fixtures/showcase/checks.mjs'));
assert.ok(!ownFiles.includes('fixtures/showcase/greet.test.mjs'));
assert.ok(ownFiles.includes(manifest.bin.osg));
assert.ok(ownFiles.includes('tools/showcase.mjs'));
assert.ok(ownFiles.every((name) => name.startsWith('dist/') || manifest.files.includes(name)
  || ['package.json', 'README.md', 'LICENSE', 'NOTICE'].includes(name)), JSON.stringify(ownFiles));
console.log(JSON.stringify({ archive, size: packed.size, unpackedSize: packed.unpackedSize,
  sha256: await sha256(archive), files: packed.files.length, declaredPlatforms, archivePlatforms, ownFiles }));
await rm(consumer, { recursive: true, force: true });
await mkdir(consumer);
await writeFile(path.join(consumer, 'package.json'), JSON.stringify({ private: true, dependencies: {
  omnispatialgraph: 'file:../omnispatialgraph-0.1.0-prototype.0.tgz' } }, null, 2));
const install = npm('install --ignore-scripts --no-fund', consumer);
console.log(JSON.stringify({ installExit: install.status, consumer }));
const installedRoot = path.join(consumer, 'node_modules/omnispatialgraph');
const installed = JSON.parse(await readFile(path.join(installedRoot, 'package.json'), 'utf8'));
assert.equal(installed.bin.osg, 'dist/cli/src/public.js');
const bin = path.join(installedRoot, installed.bin.osg);
assert.equal(await readFile(bin, 'utf8'), await readFile(path.join(root, manifest.bin.osg), 'utf8'));
assert.equal(await readFile(path.join(installedRoot, 'fixtures/showcase/checks.mjs'), 'utf8'),
  await readFile(path.join(root, 'fixtures/showcase/checks.mjs'), 'utf8'));
const shim = path.join(consumer, 'node_modules/.bin/osg.cmd');
const help = command(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `${shim} --help`], consumer);
assert.ok(help.stdout.includes('export episodes'));
console.log(JSON.stringify({ installedBin: bin, shim, helpExit: help.status, help: help.stdout }));
const boundary = command(process.execPath, ['--test', 'tests/boundary.test.mjs', 'tests/diagnostics.test.mjs'], root, 0,
  { ...process.env, OSG_TEST_PUBLIC_BIN: bin });
console.log(boundary.stdout);
const showcase = command(process.execPath, [path.join(installedRoot, 'tools/showcase.mjs'), bin], consumer);
console.log(showcase.stdout);
const api = command(process.execPath, ['--input-type=module', '-e', `import assert from 'node:assert/strict'; import {hash} from 'omnispatialgraph'; import {createRequire} from 'node:module'; const require=createRequire(new URL('./node_modules/omnispatialgraph/package.json',import.meta.url)); const lance=require('@lancedb/lancedb'); assert.equal(typeof lance.connect,'function'); assert.equal(hash({a:1}),'015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862'); console.log(JSON.stringify({api:true,nativeBinding:true,sharp:require('sharp').versions.sharp}));`], consumer);
console.log(api.stdout);
const platforms = (await readdir(path.join(installedRoot, 'node_modules/@lancedb'))).filter((name) => name.startsWith('lancedb-'));
assert.deepEqual(platforms, ['lancedb-win32-x64-msvc']);
for (const cwd of [root, consumer]) {
  const audit = JSON.parse(npm('audit --json', cwd).stdout);
  assert.equal(audit.metadata.vulnerabilities.total, 0);
  const closure = npm('ls sharp @huggingface/transformers @lancedb/lancedb apache-arrow --json', cwd, 1);
  assert.match(closure.stdout, /invalid/);
  assert.match(closure.stdout, /0\.35\.5/);
  console.log(JSON.stringify({ cwd, auditExit: 0, vulnerabilities: audit.metadata.vulnerabilities, npmLsExit: 1,
    closure: JSON.parse(closure.stdout), declaredPlatforms, archivePlatforms, installedPlatforms: platforms }));
}
