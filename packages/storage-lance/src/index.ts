import * as lance from '@lancedb/lancedb';
import { Field, Int64, List, Schema, Struct, Utf8 } from 'apache-arrow';
import { lstat, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { GraphPort, GraphRow } from '../../contracts/src/index.js';
import { OsgError, blankRow } from '../../contracts/src/index.js';

const text = new Utf8();
const integer = new Int64();
const list = () => new List(new Field('item', integer, true));
const extent = new Struct([
  new Field('frame_id', text, true), new Field('t', list(), true), new Field('q', list(), true),
  new Field('ext_min', list(), true), new Field('ext_max', list(), true)
]);
const columns = ['row_key', 'row_type', 'element_id', 'kind', 'op', 'supersedes', 'status', 'src', 'dst', 'predicate',
  'valid_from', 'valid_to', 'observed_at', 'extent', 'props', 'source_hash', 'content_hash', 'commit_id', 'branch',
  'parents', 'delta_hash', 'actor', 'generation', 'committed_at', 'source_git_revision', 'head'] as const;
const integerFields = new Set(['valid_from', 'valid_to', 'observed_at', 'generation', 'committed_at']);
const schema = new Schema(columns.map((column) => new Field(column,
  column === 'extent' ? extent : integerFields.has(column) ? integer : text,
  column !== 'row_key' && column !== 'row_type')));

function normalize(row: Record<string, unknown>): GraphRow {
  const normalized = { ...row };
  for (const field of integerFields) if (normalized[field] != null) normalized[field] = Number(normalized[field]);
  if (normalized.extent && typeof normalized.extent === 'object') {
    const input = normalized.extent as Record<string, unknown>;
    normalized.extent = input.frame_id == null ? null : Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, value && key !== 'frame_id' ? Array.from(value as Iterable<bigint>, Number) : value]));
  }
  return normalized as unknown as GraphRow;
}

export async function openStore(directory: string, create = false): Promise<GraphPort> {
  const connection = await lance.connect(directory, { readConsistencyInterval: 0 });
  let table: lance.Table;
  if (create) {
    if (!(await connection.tableNames()).includes('graph')) {
      await mkdir(directory, { recursive: true });
      const staging = await mkdtemp(path.join(directory, '.init-'));
      try {
        const stagedConnection = await lance.connect(staging, { readConsistencyInterval: 0 });
        // Create ROOT as initial data. Publish only the complete local table directory.
        const stagedTable = await stagedConnection.createTable('graph', lance.makeArrowTable([
          { ...blankRow({ row_key: 'head:main', row_type: 'head', branch: 'main', head: 'ROOT' }),
            extent: { frame_id: null, t: null, q: null, ext_min: null, ext_max: null } }
        ], { schema }), { mode: 'create' });
        stagedTable.close();
        stagedConnection.close();
        const destination = path.join(directory, 'graph.lance');
        try { await rename(path.join(staging, 'graph.lance'), destination); }
        catch (error) {
          // A nonempty winner cannot be replaced by directory rename; other failures propagate.
          if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
          const stat = await lstat(destination);
          if (!stat.isDirectory() || stat.isSymbolicLink()) throw error;
        }
      } finally { await rm(staging, { recursive: true, force: true }); }
    }
    table = await connection.openTable('graph');
  } else {
    if (!(await connection.tableNames()).includes('graph')) throw new OsgError('NOT_INITIALIZED', 'Graph is not initialized');
    table = await connection.openTable('graph');
  }
  let cached: { version: number; rows: GraphRow[] } | undefined;
  const heads = await table.query().where("row_key = 'head:main'").toArray();
  if (!heads.length) throw new OsgError('NOT_INITIALIZED', 'Graph has no main head; initialization is incomplete. Preserve the store for recovery.');
  if (heads.length !== 1 || heads[0]!.row_type !== 'head' || heads[0]!.branch !== 'main' ||
      typeof heads[0]!.head !== 'string' || !/^(ROOT|c[0-9a-f]{64})$/.test(heads[0]!.head)) {
    throw new OsgError('VERIFY_FAILED', 'Invalid main head');
  }
  return {
    // toArray() converts the nested `extent` struct row by row (about 20x slower); read Arrow columns directly instead.
    // Table versions are immutable, so rows read at a version can be reused until the version changes.
    async rows() {
      const version = await table.version();
      if (cached?.version === version) return structuredClone(cached.rows);
      const arrow = await table.query().toArrow();
      if (arrow.numRows === 0) { cached = { version, rows: [] }; return []; }
      const vectors = columns.filter((column) => column !== 'extent').map((column) => [column, arrow.getChild(column)!] as const);
      const parts = ['frame_id', 't', 'q', 'ext_min', 'ext_max'].map((name) => arrow.getChild('extent')!.getChild(name)!);
      const out: GraphRow[] = [];
      for (let i = 0; i < arrow.numRows; i++) {
        const row: Record<string, unknown> = {};
        for (const [column, vector] of vectors) {
          const value = vector.get(i);
          row[column] = integerFields.has(column) && value != null ? Number(value) : value;
        }
        const frame = parts[0]!.get(i);
        row.extent = frame == null ? null : {
          frame_id: frame,
          ...Object.fromEntries((['t', 'q', 'ext_min', 'ext_max'] as const).map((name, k) => {
            const value = parts[k + 1]!.get(i);
            return [name, value ? Array.from(value as Iterable<bigint>, Number) : value];
          }))
        };
        out.push(row as unknown as GraphRow);
      }
      cached = { version, rows: out };
      // Callers own their rows, including nested extent lists; the cache stays private.
      return structuredClone(out);
    },
    async head(branch) {
      const row = (await table.query().where(`row_key = 'head:${branch}'`).toArray())[0];
      return row?.head as string ?? null;
    },
    async publish(rows, expectedHead) {
      if (!/^(ROOT|c[0-9a-f]{64})$/.test(expectedHead) || rows.filter((row) => row.row_type === 'head').length !== 1 ||
          rows.filter((row) => row.row_type === 'commit').length !== 1 ||
          rows.some((row) => row.row_type === 'head' && row.row_key !== 'head:main')) {
        throw new OsgError('INVALID_DELTA', 'Invalid head CAS');
      }
      const seen = new Set<string>();
      const existing = new Set((await table.query().select(['row_key']).toArray()).map((row) => row.row_key as string));
      for (const row of rows) {
        if (seen.has(row.row_key) || (row.row_type !== 'head' && existing.has(row.row_key))) throw new OsgError('INVALID_DELTA', 'Duplicate or mutable row key');
        seen.add(row.row_key);
      }
      const result = await table.mergeInsert('row_key')
        .whenMatchedUpdateAll({ where: `target.head = '${expectedHead}'` }).whenNotMatchedInsertAll().execute(
          lance.makeArrowTable(rows.map((row) => ({ ...row, extent: row.extent ? {
            frame_id: row.extent.frame_id, t: row.extent.t?.map(BigInt) ?? null, q: row.extent.q?.map(BigInt) ?? null,
            ext_min: row.extent.ext_min?.map(BigInt) ?? null, ext_max: row.extent.ext_max?.map(BigInt) ?? null
          } : { frame_id: null, t: null, q: null, ext_min: null, ext_max: null },
            valid_from: row.valid_from == null ? null : BigInt(row.valid_from), valid_to: row.valid_to == null ? null : BigInt(row.valid_to),
            observed_at: row.observed_at == null ? null : BigInt(row.observed_at), generation: row.generation == null ? null : BigInt(row.generation),
            committed_at: row.committed_at == null ? null : BigInt(row.committed_at) })), { schema }));
      return Number(result.numUpdatedRows) === 1;
    }
  };
}
