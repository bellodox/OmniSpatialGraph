import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scan } from '../dist/indexing-kilo/src/index.js';

test('imports resolve supported code extensions without Markdown or unknown-extension guesses', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'osg-imports-'));
  try {
    await writeFile(path.join(root, 'entry.ts'), `import './x.js';\nimport './foo.bar';\nimport './x.md';\nimport './onlydoc';\nimport './direct.ts';\nimport './view.jsx';\nimport './folder';\n`);
    for (const name of ['x.ts', 'foo.ts', 'direct.ts', 'view.tsx']) await writeFile(path.join(root, name), 'export const value = 1;');
    for (const name of ['x.md', 'onlydoc.md']) await writeFile(path.join(root, name), '# Not a module');
    await mkdir(path.join(root, 'folder'));
    await writeFile(path.join(root, 'folder/index.ts'), 'export const value = 1;');
    const result = await scan(root);
    const edges = result.facts.filter((fact) => fact.kind === 'imports');
    assert.deepEqual(edges.map((fact) => fact.dst).sort(), ['code:file:direct.ts', 'code:file:folder/index.ts', 'code:file:view.tsx', 'code:file:x.ts']);
    assert.ok(edges.every((fact) => !fact.dst.endsWith('.md')));
    assert.ok(!edges.some((fact) => fact.props.name === './foo.bar'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('compiler provider keeps overload identity independent of order/lines, skips ambiguous names and task docs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'osg-provider-'));
  try {
    await mkdir(path.join(root, 'docs/tasks'), { recursive: true });
    await mkdir(path.join(root, '.osg'));
    await writeFile(path.join(root, 'docs/tasks/private.md'), '# Skip this\n');
    await writeFile(path.join(root, '.osg/secret.ts'), 'export function leak() {}');
    const declarations = ['export function parse(value: number): number;', 'export function parse(value: string): string;',
      'export function parse(value: unknown) { return value; }'];
    const source = path.join(root, 'a.ts');
    await writeFile(source, declarations.join('\n'));
    const before = await scan(root);
    assert.equal(before.files, 1);
    const ids = before.facts.filter((fact) => fact.element_id.startsWith('code:symbol:')).map((fact) => fact.element_id).sort();
    assert.equal(ids.length, 3);
    assert.ok(ids.every((id) => /~[a-f0-9]{8}$/.test(id)));
    await writeFile(source, ['\n', declarations[1], declarations[0], declarations[2]].join('\n'));
    const after = await scan(root);
    assert.deepEqual(after.facts.filter((fact) => fact.element_id.startsWith('code:symbol:')).map((fact) => fact.element_id).sort(), ids);
    assert.ok(after.facts.some((fact) => fact.element_id === ids[0] && fact.extent.ext_min[0] > before.facts.find((item) => item.element_id === ids[0]).extent.ext_min[0]));
    await writeFile(source, 'export function duplicate(x: number) {}\nexport function duplicate(x: number) {}\n');
    const ambiguous = await scan(root);
    assert.equal(ambiguous.facts.filter((fact) => fact.element_id.startsWith('code:symbol:')).length, 0);
    assert.ok(ambiguous.warnings.some((warning) => warning.code === 'AMBIGUOUS_DECLARATION'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
