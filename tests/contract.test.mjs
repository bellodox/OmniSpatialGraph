// Copyright 2026 Vlad Bellomorski
// SPDX-License-Identifier: Apache-2.0

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canon, hash, sourcePath } from '../dist/core/src/hash.js';

const vectors = [null, true, false, 0, 1, -1, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER,
  '', 'é', 'e\u0301', '🧪', [], [null], [1, 2, 3], {}, { b: 2, a: 1 }, { x: null },
  { x: { y: null } }, { x: [null, { z: 2 }] }, { x: 'é', y: false }, { aa: 3, a: 4 },
  { extent: { frame_id: null, t: null } }, ['é', 'e\u0301'], { nested: { alpha: 1, beta: [2, 3] } }];

test('spec 9.1 and Appendix A omit nested empty/all-null members but preserve array positions', () => {
  // Appendix A isAllNullStruct uses Object.values(...).every: empty objects qualify.
  const emptyDigest = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
  for (const input of [{ nested: {} }, { nested: { value: null } }, { nested: { value: undefined } }]) {
    assert.equal(canon(input), '{}');
    assert.equal(hash(input), emptyDigest);
  }
  assert.equal(canon({ nested: { child: { value: null } } }), '{"nested":{}}');
  assert.equal(canon([{}, { value: null }, null]), '[{},{},null]');
});

test('26 independent SHA-256 canonical fixtures and null/NFC equivalence', () => {
  assert.ok(vectors.length >= 20);
  for (const input of vectors) {
    const expected = createHash('sha256').update(canon(input), 'utf8').digest('hex');
    assert.equal(hash(input), expected);
  }
  assert.equal(hash('e\u0301'), hash('é'));
  assert.equal(canon({ b: null, a: 1, empty: { x: null } }), '{"a":1}');
  assert.throws(() => canon(0.1), { code: 'INVALID_SCHEMA' });
  assert.throws(() => canon(Number.MAX_SAFE_INTEGER + 1), { code: 'INVALID_SCHEMA' });
  assert.throws(() => canon(BigInt(Number.MAX_SAFE_INTEGER) + 1n), { code: 'INVALID_SCHEMA' });
  assert.equal(sourcePath('src\\a#b.ts'), 'src/a%23b.ts');
  for (const unsafe of ['../outside', 'C:\\private', '/absolute', 'a//b']) assert.throws(() => sourcePath(unsafe));
});
