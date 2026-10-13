import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertAtomicVisibility, assertUnique, dataRow, makeBatch } from './rows.ts';

// Reject duplicate qualified keys before the SDK's undefined multiple-match behavior.
test('qualified keys reject duplicate id/branch pairs but distinguish branches', () => {
  const row = dataRow('entity', 'probe::symbol', '0', 'old', 'baseline');
  assert.throws(() => assertUnique([row, row]), /Duplicate/);
  assert.doesNotThrow(() => assertUnique([row, { ...row, branch: 'other' }]));
});

// Neither direction of the marker equivalence permits a partial batch.
test('atomic visibility accepts only none or all with exactly one marker', () => {
  assert.doesNotThrow(() => assertAtomicVisibility(0, 0, 10));
  assert.doesNotThrow(() => assertAtomicVisibility(10, 1, 10));
  for (const [rows, markers] of [[1, 0], [1, 1], [10, 0], [0, 1], [10, 2]]) {
    assert.throws(() => assertAtomicVisibility(rows!, markers!, 10));
  }
});

// Markers intentionally cannot embed the native version being published.
test('batch contains semantic marker and deterministic delta hash only', () => {
  const rows = [dataRow('edge', 'probe::a->b', '0', 'calls', 'commit-1')];
  const batch = makeBatch(rows, 'commit-1', ['baseline']);
  assert.equal(batch.length, 2);
  assert.equal(batch[1]!.deltaHash, makeBatch(rows, 'commit-1', ['baseline'])[1]!.deltaHash);
  assert.equal('nativeLanceVersion' in batch[1]!, false);
  assert.deepEqual(JSON.parse(batch[1]!.parents!), ['baseline']);
});
