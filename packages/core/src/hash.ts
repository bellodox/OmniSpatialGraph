import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Element } from '../../contracts/src/index.js';
import { OsgError } from '../../contracts/src/index.js';

// Canonical keys follow JS UTF-16 ordering; null-valued object members are absent.
export function canon(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number' || typeof value === 'bigint') {
    if ((typeof value === 'number' && !Number.isSafeInteger(value)) ||
        (typeof value === 'bigint' && (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)))) {
      throw new OsgError('INVALID_SCHEMA', 'Hashed numbers must be safe integers');
    }
    return String(value);
  }
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return `[${Array.from(value as ArrayLike<unknown>, canon).join(',')}]`;
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const entries = Object.keys(object).filter((key) => object[key] != null &&
      !(typeof object[key] === 'object' && !Array.isArray(object[key]) && !ArrayBuffer.isView(object[key]) &&
        Object.values(object[key] as object).every((entry) => entry == null)));
    if (entries.some((key) => key !== key.normalize('NFC')) || new Set(entries.map((key) => key.normalize('NFC'))).size !== entries.length) {
      throw new OsgError('INVALID_SCHEMA', 'Noncanonical object key');
    }
    return `{${entries.sort().map((key) => `${JSON.stringify(key)}:${canon(object[key])}`).join(',')}}`;
  }
  throw new OsgError('INVALID_SCHEMA', 'Unsupported hashed value');
}

export function hash(value: unknown): string {
  return bytesToHex(sha256(new TextEncoder().encode(canon(value))));
}

export function contentHash(element: Omit<Element, 'content_hash'>): string {
  const { element_id, kind, op, status, src, dst, predicate, extent, props, source_hash } = element;
  return hash({ element_id, kind, op, status, src, dst, predicate, extent, props, source_hash });
}

export function escapeComponent(value: string): string {
  return value.normalize('NFC').replace(/[\%#|~@.]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

export function sourcePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').normalize('NFC');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new OsgError('INVALID_SCHEMA', 'Source path must be workspace-relative');
  }
  return normalized.split('/').map((segment) => segment.replace(/[%#|~@]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
}
