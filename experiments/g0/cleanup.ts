import assert from 'node:assert/strict';
import { rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { root, generated, record } from './rows.ts';

// Remove only generated disposable experiment directories, never source, evidence, or dependencies.
await record('cleanup', async () => {
  const removed: string[] = [];
  for (const path of [generated, join(root, 'dist'), join(root, 'build')]) {
    const scoped = relative(root, path);
    assert(scoped && !scoped.startsWith('..'));
    await rm(path, { recursive: true, force: true });
    await assert.rejects(stat(path), { code: 'ENOENT' });
    removed.push(scoped);
  }
  return { removed, generatedDatabasesAndBackupsRemoved: true, durableSourcesAndEvidencePreserved: true };
});
