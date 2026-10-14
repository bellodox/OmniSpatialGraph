import test from 'node:test';
import assert from 'node:assert/strict';
import { greet } from './src/greet.js';

test('preserves the greeting format', () => assert.equal(greet('Ada'), 'Hello, Ada!'));
test('preserves capitalization', () => assert.equal(greet('aDa'), 'Hello, aDa!'));
test('trims leading spaces', () => assert.equal(greet(' Ada'), 'Hello, Ada!'));
test('trims trailing spaces', () => assert.equal(greet('Ada '), 'Hello, Ada!'));
test('rejects blank names', () => assert.throws(() => greet('  '), TypeError));
test('preserves internal spaces', () => assert.equal(greet('Ada  Lovelace'), 'Hello, Ada  Lovelace!'));
test('accepts a one-letter name', () => assert.equal(greet('A'), 'Hello, A!'));
test('rejects non-string input', () => assert.throws(() => greet(null), TypeError));
