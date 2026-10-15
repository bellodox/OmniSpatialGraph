# Architecture Overview

The standalone, daemon-free private prototype implements part of the frozen [target design](OSG_MVP_SPEC.md:255), not accepted Approach A or the complete GraphRAG MVP. Evidence and remaining limits live in the [handoff](public-prototype.md).

## Boundaries

| Component | Responsibility / source |
| --- | --- |
| Contracts | [Graph types and storage port](../packages/contracts/src/index.ts:1) |
| Core | [Canonical hashing](../packages/core/src/hash.ts:7), [commits](../packages/core/src/graph.ts:150), [snapshots](../packages/core/src/graph.ts:71), [verification](../packages/core/src/graph.ts:193), [sync and episodes](../packages/core/src/memory.ts:24), [retrieval](../packages/core/src/retrieval.ts:75) |
| Provider | [Discovery, pre-read policy and reconciliation facts](../packages/indexing-kilo/src/index.ts:63); [Tree-sitter grammar map](../packages/indexing-kilo/src/treesitter.ts:34) |
| Storage | [LanceDB/Arrow adapter](../packages/storage-lance/src/index.ts:1), initial ROOT/staged publication and atomic head CAS |
| CLI | [Public worker launcher](../packages/cli/src/public.ts:57) and [backend dispatch](../packages/cli/src/index.ts:510) |

Core/contracts use ports rather than adapter dependencies; only storage imports LanceDB/Arrow ([target boundaries](OSG_MVP_SPEC.md:272)). The [manifest](../package.json:12) declares five typed exports; root/core share the [core barrel](../packages/core/src/index.ts:1). Direct API/backend calls do not inherit the public launcher's native-diagnostic boundary. Its IPC cap is post-deserialization; hostile pre-launch Node configuration is outside that guarantee.

## Data flow and authority

Discovery → mandatory/ancestor-ignore checks → permitted-file read/reparse → Tree-sitter facts → identity reconciliation → one append-only commit with atomic head CAS. IDs do not depend on line numbers. Row reachability, not Lance versions, supplies history. Repository symbols use one-dimensional extents in the unified spatial model; moving-object fixtures use the same model ([purpose](OSG_MVP_SPEC.md:51)).

[Current state](../packages/core/src/state.ts:36) is reconstructed from committed rows. Editable derived caches cannot authorize status/text or replace permitted-source reparsing. [Doctor](../packages/cli/src/index.ts:680) ignores a well-formed cache naming another head; a cache claiming the current head must match complete authoritative rows, count and unique IDs. This favors correctness over an unmeasured fast path. Storage returns defensive copies, including nested extents.

[Recall](../packages/core/src/retrieval.ts:75) defaults to weighted lexical ranking, typed two-hop expansion and episode reservation. [Optional vector candidates](../packages/core/src/retrieval.ts:152) blend into task-query seeds only while their text hashes match the selected graph state; entity queries are unchanged. Vectors are derived cache data, not graph authority or generated answers. The [CLI model adapter](../packages/cli/src/embedder.ts:19) permits remote model loading only for the explicit embedding command, never context reads. Fake-embedder tests do not establish real-model inference or useful real-task recall. Supersession independently checks current live hypothesis endpoints on write/read; immediate successor labels do not erase rows or confer approval. [Source snippets](../packages/core/src/retrieval.ts:52) are explicitly untrusted values. Current [readable-source policy](../packages/indexing-kilo/src/index.ts:63) governs hashing/snippets even for historical context; denied access means stale/no snippet, not erased metadata. Reads stay pure.

## Parser and recovery limits

The [grammar map](../packages/indexing-kilo/src/treesitter.ts:34) covers fourteen languages; a missing grammar uses a warned limited fallback. [Swift](../packages/indexing-kilo/src/treesitter.ts:678) reuses one baseline-only child per scan to isolate an observed fatal V8 compilation failure; [scan cleanup](../packages/indexing-kilo/src/index.ts:225) closes it. Requests have a 60-second timeout, not a whole-scan timeout; the former 16 MiB output cap is absent. Its transient-failure fact/link preservation and real-repository performance remain [unverified follow-ups](limitations.md#separately-authorized-follow-ups).

The preserved repository store is format 2 after a human-authorized migration, not blocked pending upgrade ([snapshot](public-prototype.md#repository-migration)). Migration and replacement restore are explicit authorized maintenance, not automatic cache repair. Init relies on local directory-rename/config hard-link publication; normal-unwinding cleanup is not abrupt-crash/fsync durability. No hostile TOCTOU or network-filesystem guarantee is claimed. Runtime data stays separate from source/docs and the host index ([confinement](OSG_MVP_SPEC.md:187)).

## Technology inventory

Declared dependencies are source facts; tested execution is separately attributed in the [handoff](public-prototype.md#evidence).

| Area | Current checkout fact | Evidence |
| --- | --- | --- |
| Runtime | Node 22/24 LTS; recorded Windows x64 Node 24.14.1/npm 11.11.0 | [Engines](../package.json:7) |
| Package/API | Private 0.1.0-prototype.0, Apache-2.0 metadata; public worker bin and five typed exports | [Manifest](../package.json:2) |
| Build | TypeScript 5.9.3 and Node types 24.10.0 are development-only; no provider runtime TypeScript dependency or bundle entry; strict NodeNext output | [Root metadata](../package.json:40), [provider metadata](../packages/indexing-kilo/package.json), [compiler configuration](../tsconfig.json:2) |
| Persistence | LanceDB 0.40.0 and Arrow 18.1.0 | [Manifest](../package.json:33), [adapter](../packages/storage-lance/src/index.ts:1) |
| Hashing/ignore | noble hashes 2.0.1; ignore 7.0.12 | [Pins](../package.json:35) |
| Parsing | Tree-sitter WASM 0.3.1 plus tree-sitter-wasms 0.1.13; fourteen languages, isolated Swift compilation | [Pins](../package.json:36), [grammar map](../packages/indexing-kilo/src/treesitter.ts:34) |
| Retrieval | Lexical by default, typed two-hop expansion, episode reservation; optional semantic vector blending for task queries | [Implementation](../packages/core/src/retrieval.ts:75), [vector blending](../packages/core/src/retrieval.ts:152) |
| Runtime format | Format 2; explicit migration and verified backup/restore | [CLI](../packages/cli/src/index.ts:542), [migration evidence](public-prototype.md#repository-migration) |
| Tests | Built-in Node test runner; build before tests | [Scripts](../package.json:26), [attributed latest proof](public-prototype.md#evidence) |
| Native/dependency limits | Bundled Sharp 0.35.5 conflicts with LanceDB's optional Transformers 3.0.2 range; images remain unsupported. The separate optional embedding adapter is off by default, not compatibility/risk approval. Seven Lance optional-platform declarations are not seven bundled Lance binaries | [Manifest conditions](../package.json:20), [human decisions](limitations.md#human-decisions) |

Install with lifecycle scripts disabled and optional natives retained; deliberate build/prepack remains explicit. No lint/docs-check or prototype-pack alias is configured. The historical Windows archive is platform-built and not proof of current parity or Linux/macOS execution. Audit success does not resolve compatibility, grammar/native-LGPL obligations or frozen-spec MIT versus Apache checkout licensing; see [human decisions](limitations.md#human-decisions).

The Linux environment in [specification §18](OSG_MVP_SPEC.md:846) is external historical prototype evidence, not this workspace's execution proof.
