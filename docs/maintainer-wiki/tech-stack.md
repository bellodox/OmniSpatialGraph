# Technology Inventory

Manifest/source facts and task-provided execution are distinguished below. See the [current handoff](../public-prototype.md#current-human-task-reconciliation-2026-10-15); final reviews of the later checkout are pending, not supplied by historical verdicts.

| Area | Experiment fact / target distinction | Evidence |
| --- | --- | --- |
| Runtime | Node 22/24 LTS; Windows x64 tested on 24.14.1 | [Manifest](../../package.json:7), [recorded proof](../public-prototype.md#recorded-independent-proofnot-rerun-by-documentation) |
| Package/API | One private 0.1.0-prototype.0 package declaring Apache-2.0; public worker bin, five exports/types; no distribution clearance | [Manifest](../../package.json:2) |
| Language/build | TypeScript 5.9.3; strict NodeNext compilation to dist; Node types 24.10.0 | [Pins](../../package.json:32), [compiler configuration](../../tsconfig.json:2) |
| Persistence | LanceDB exactly 0.40.0; Arrow exactly 18.1.0 | [Manifest](../../package.json:33), [adapter](../../packages/storage-lance/src/index.ts:1) |
| Native packaging | Seven Lance optional-platform declarations retained; archive physically contains Windows x64 Lance only, not seven binaries | [Manifest conditions](../../package.json:23), [archive assertions](../../tools/consumer-proof.mjs:72) |
| Hashing/ignore/images | noble hashes 2.0.1, ignore 7.0.12, bundled Sharp 0.35.5; images/embeddings disabled | [Pins/override](../../package.json:32), [hash source](../../packages/core/src/hash.ts:1) |
| Parsing | Tree-sitter WASM 0.3.1 plus tree-sitter-wasms 0.1.13; multi-language including TS/JS; Swift-only bounded baseline-compilation subprocess | [Pins](../../package.json:36), [grammar map](../../packages/indexing-kilo/src/treesitter.ts:34), [Swift boundary](../../packages/indexing-kilo/src/treesitter.ts:675) |
| Retrieval/cache | Weighted lexical ranking, typed two-hop expansion, episode reservation; authoritative-row state reconstruction and permitted-file reparsing, not trusted editable caches or vectors | [Retrieval](../../packages/core/src/retrieval.ts:69), [state](../../packages/core/src/state.ts:28), [scanner](../../packages/indexing-kilo/src/index.ts:151) |
| Data format | Format 2, explicit migration, verified backups and store-replacing restore | [CLI](../../packages/cli/src/index.ts:137), [recovery](../../packages/cli/src/index.ts:325) |
| Tests | Built-in Node test runner; build first; task reports Windows build/typecheck 0, full 90 pass/0 fail/0 skip, focused 7 pass; no-edit simplifier typecheck 0/focused 7 pass | [Scripts](../../package.json:26), [current proof](../public-prototype.md#current-windows-evidence-and-operational-memory-blocker) |

Install with lifecycle scripts disabled and optional natives retained. No lint/docs-check or prototype-pack alias exists. Current task dependency inspection exits 1/ELSPROBLEMS: Transformers 3.0.2 requires Sharp ^0.33.5, excluding bundled 0.35.5. Images/embeddings remain disabled; original checker reports 2026-10-15 lockfile-only scripts-disabled audit exit 0/zero advisories, not rerun by documentation. Earlier audit/signature/independent-install/archive results are historical, not current compatibility, security or license clearance. Current archive parity, independent clean install, cross-platform and native/LGPL redistribution closure remain unverified. Private Apache metadata differs from frozen-spec MIT and unchanged agent-guidance UNLICENSED; humans must resolve legal/distribution conditions. Hook configuration is untouched. Repository memory sync is blocked pending separately authorized format migration; implementation episode persistence is independently verified, separately from failed source sync and stale anchors ([evidence/conditions](../public-prototype.md#current-human-task-reconciliation-2026-10-15)).

The Linux prototype environment in [§18](../OSG_MVP_SPEC.md:846) is external historical evidence, not this workspace's runtime.
