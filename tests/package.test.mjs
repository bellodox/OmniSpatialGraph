import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('TypeScript stays development-only in root and provider package metadata', async () => {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const provider = JSON.parse(await readFile('packages/indexing-kilo/package.json', 'utf8'));
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  assert.equal(manifest.devDependencies.typescript, '5.9.3');
  assert.equal(manifest.dependencies.typescript, undefined);
  assert.ok(!manifest.bundleDependencies.includes('typescript'));
  assert.equal(provider.dependencies.typescript, undefined);
  assert.equal(lock.packages[''].devDependencies.typescript, manifest.devDependencies.typescript);
  assert.equal(lock.packages[''].dependencies.typescript, undefined);
  assert.ok(!lock.packages[''].bundleDependencies.includes('typescript'));
  assert.deepEqual(lock.packages['packages/indexing-kilo'].dependencies, provider.dependencies);
  assert.equal(lock.packages['node_modules/typescript'].version, manifest.devDependencies.typescript);
  assert.equal(lock.packages['node_modules/typescript'].dev, true);
  assert.equal(lock.packages['node_modules/typescript'].inBundle, undefined);
});

test('optional Transformers closure uses compatible exact pins and narrowly scoped overrides', async () => {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  assert.equal(manifest.optionalDependencies['@huggingface/transformers'], '4.3.1');
  assert.equal(manifest.dependencies['@huggingface/transformers'], undefined);
  assert.deepEqual(manifest.overrides, {
    '@lancedb/lancedb@0.40.0': { '@huggingface/transformers': '$@huggingface/transformers' },
    '@huggingface/transformers@4.3.1': { sharp: '$sharp' }
  });
  // npm checks bundled nodes against raw upstream ranges, bypassing overrides.
  assert.ok(!manifest.bundleDependencies.includes('@lancedb/lancedb'));
  assert.ok(!manifest.bundleDependencies.includes('@huggingface/transformers'));
  assert.deepEqual(lock.packages[''].optionalDependencies, manifest.optionalDependencies);
  assert.deepEqual(lock.packages[''].bundleDependencies, manifest.bundleDependencies);
  for (const [name, version] of [
    ['@huggingface/transformers', '4.3.1'], ['sharp', '0.35.5'],
    ['onnxruntime-node', '1.30.0'], ['onnxruntime-web', '1.31.0-dev.20260914-8d85527a0'],
    ['@lancedb/lancedb', '0.40.0'], ['apache-arrow', '18.1.0']
  ]) {
    const resolved = Object.entries(lock.packages).filter(([location]) => location.endsWith(`/node_modules/${name}`) || location === `node_modules/${name}`);
    assert.ok(resolved.length > 0, `${name} must be resolved`);
    assert.deepEqual([...new Set(resolved.map(([, metadata]) => metadata.version))], [version], `${name} has no incompatible nested version`);
  }
  const transformers = lock.packages['node_modules/@huggingface/transformers'];
  assert.equal(transformers.optional, true);
  assert.equal(transformers.dependencies.sharp, '^0.35.4');
  assert.equal(transformers.dependencies['onnxruntime-node'], '1.30.0');
  assert.equal(transformers.dependencies['onnxruntime-web'], '1.31.0-dev.20260914-8d85527a0');
  const lance = lock.packages['node_modules/@lancedb/lancedb'];
  for (const platform of ['darwin-arm64', 'linux-x64-gnu', 'linux-arm64-gnu', 'linux-x64-musl', 'linux-arm64-musl', 'win32-x64-msvc', 'win32-arm64-msvc']) {
    const name = `@lancedb/lancedb-${platform}`;
    assert.equal(lance.optionalDependencies[name], manifest.dependencies['@lancedb/lancedb']);
    assert.equal(lock.packages[`node_modules/${name}`].version, manifest.dependencies['@lancedb/lancedb']);
    assert.equal(lock.packages[`node_modules/${name}`].optional, true);
  }
});

test('public root API remains portable; package controls a single private compiled entry', async () => {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(manifest.name, 'omnispatialgraph');
  assert.equal(manifest.private, true);
  assert.equal(manifest.license, 'Apache-2.0');
  assert.equal(manifest.bin.osg, 'dist/cli/src/public.js');
  assert.deepEqual(manifest.files, ['NOTICE', 'dist/cli/src', 'dist/contracts/src', 'dist/core/src', 'dist/indexing-kilo/src', 'dist/storage-lance/src',
    'tools/showcase.mjs', 'fixtures/showcase/package.json', 'fixtures/showcase/src/greet.js', 'fixtures/showcase/checks.mjs']);
  assert.match(manifest.osgPrototype.compatibility, /embedding wrapper remains unsupported/);
  assert.match(manifest.osgPrototype.compatibility, /Root overrides do not propagate to consumers/);
  assert.match(manifest.osgPrototype.distribution, /Apache-2\.0 licensed source/);
  assert.ok((await readFile('fixtures/showcase/checks.mjs', 'utf8')).includes('rejects blank names'));
  for (const [name, expected] of [['@lancedb/lancedb', '0.40.0'], ['apache-arrow', '18.1.0'], ['sharp', '0.35.5']]) {
    assert.equal(manifest.dependencies[name], expected);
  }
  const core = await import(pathToFileURL(path.resolve('dist/core/src/index.js')));
  assert.equal(core.hash({ a: 1 }), '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862');
  for (const folder of ['cli', 'core', 'contracts', 'storage-lance', 'indexing-kilo']) {
    const names = await readdir(path.join('dist', folder, 'src'));
    assert.ok(names.includes('index.js'));
    assert.ok(names.includes('index.d.ts'));
  }
  for (const folder of ['core', 'contracts']) for (const name of await readdir(path.join('packages', folder, 'src'))) {
    if (name.endsWith('.ts')) assert.doesNotMatch(await readFile(path.join('packages', folder, 'src', name), 'utf8'), /(?:from|import\()\s*['"](?:node:|@lancedb\/)/);
  }
});
