import { readFile, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// This is a private evaluation artifact, never an automatic release path.
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(manifest.private, true);
assert.equal(manifest.license, 'Apache-2.0');
assert.equal(manifest.bin.osg, 'dist/cli/src/public.js');
assert.ok(manifest.files.includes('fixtures/showcase/checks.mjs'));
assert.ok((await readFile(new URL('../fixtures/showcase/checks.mjs', import.meta.url), 'utf8')).includes('rejects blank names'));
console.error(manifest.osgPrototype.compatibility);
console.error(manifest.osgPrototype.nativeClosure);

// Never pack a build containing deleted or renamed source files.
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
const compiler = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], { stdio: 'inherit' });
if (compiler.error) throw compiler.error;
if (compiler.status !== 0) process.exit(compiler.status ?? 1);
