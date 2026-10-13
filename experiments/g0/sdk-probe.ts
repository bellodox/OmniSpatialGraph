import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { connect } from '@lancedb/lancedb';
import { root, generated, baseline, tableName, record } from './rows.ts';

// Verify actual registry, installed pins, native binary load, and persisted schema/rows.
await record('sdk', async () => {
  assert.equal(process.platform, 'win32');
  assert.equal(process.arch, 'x64');
  const require = createRequire(import.meta.url);
  const registryCommand = 'npm view @lancedb/lancedb@0.40.0 version gitHead engines peerDependencies optionalDependencies dist --json';
  const registry = JSON.parse(execFileSync('cmd.exe', ['/d', '/s', '/c', registryCommand], { cwd: root, encoding: 'utf8' }));
  assert.equal(registry.gitHead, 'b1b080b97c3edd2fd9f2aae8a3b71ff19487b1f8');
  assert.equal(registry.version, '0.40.0');
  const pins = { '@lancedb/lancedb': '0.40.0', '@lancedb/lancedb-win32-x64-msvc': '0.40.0', 'apache-arrow': '18.1.0', 'typescript': '7.0.2', '@typescript/typescript-win32-x64': '7.0.2', '@types/node': '22.20.5' };
  const lockBytes = await readFile(join(root, 'package-lock.json'));
  const lock = JSON.parse(lockBytes.toString());
  const installed: Record<string, unknown> = {};
  for (const [name, version] of Object.entries(pins)) {
    const packageJson = JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8'));
    assert.equal(packageJson.version, version);
    const locked = lock.packages[`node_modules/${name}`];
    assert.equal(locked.version, version);
    assert(locked.integrity?.startsWith('sha512-'));
    installed[name] = { version, integrity: locked.integrity, resolved: locked.resolved };
  }
  const nativeEntry = require.resolve('@lancedb/lancedb-win32-x64-msvc');
  require('@lancedb/lancedb-win32-x64-msvc');
  const nativeSha256 = createHash('sha256').update(await readFile(nativeEntry)).digest('hex');
  const path = join(generated, `smoke-${Date.now()}`);
  const version = await baseline(path);
  const connection = await connect(path);
  try {
    const table = await connection.openTable(tableName);
    try {
      assert.equal(await table.version(), version);
      assert.equal(await table.countRows(), 3);
      assert.equal(await table.countRows("payload = 'keep'"), 1);
      const fields = (await table.schema()).fields.map(field => ({ name: field.name, type: field.type.toString(), nullable: field.nullable }));
      assert(!fields.some(field => field.name === 'nativeLanceVersion'));
      return { node: process.version, npm: execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm --version'], { encoding: 'utf8' }).trim(), platform: process.platform, arch: process.arch, os: execFileSync('cmd.exe', ['/d', '/s', '/c', 'ver'], { encoding: 'utf8' }).trim(), registryCommand, registry, installed, lockSha256: createHash('sha256').update(lockBytes).digest('hex'), nativeEntry: 'node_modules/@lancedb/lancedb-win32-x64-msvc/lancedb.win32-x64-msvc.node', nativeSha256, nativeLoad: true, baselineVersion: version, reopenedRows: 3, fields };
    } finally { table.close(); }
  } finally { connection.close(); }
});
