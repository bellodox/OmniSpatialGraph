# Experimental Source Map and Target Architecture

The [specified design](../OSG_MVP_SPEC.md:255) remains the frozen canonical target. The private prototype is CLI-first and daemon-free, not the full MVP. See the [current handoff](../public-prototype.md#current-human-task-reconciliation-2026-10-15) for task-provided Windows proof, pending final reviews and unresolved distribution conditions.

| Boundary | Actual experimental source |
| --- | --- |
| Contracts | [Types and graph port](../../packages/contracts/src/index.ts:1) |
| Core | [Canonical hashing](../../packages/core/src/hash.ts:7), [commits/snapshots/verification](../../packages/core/src/graph.ts:143), [sync/memory/history](../../packages/core/src/memory.ts:9); no implemented merge CLI |
| CLI | [Public isolated worker launcher](../../packages/cli/src/public.ts:55) captures worker fd1/fd2 and validates IPC; [internal backend](../../packages/cli/src/index.ts:63) parses commands, confines runtime and wires memory/export |
| Experimental provider | [Multi-language scanner](../../packages/indexing-kilo/src/index.ts:116) and [Tree-sitter grammar map](../../packages/indexing-kilo/src/treesitter.ts:34); not formal Approach A acceptance or a host-index adapter |
| Storage adapter | [Pinned LanceDB/Arrow schema, initial-data ROOT/private staging publication and atomic head CAS](../../packages/storage-lance/src/index.ts:34) |

Target boundaries: [dependency rules](../OSG_MVP_SPEC.md:272). The root package has [five compiled exports with declarations](../../package.json:12); root/core share the [hash/graph/memory barrel](../../packages/core/src/index.ts:1). Direct API/internal-backend calls do not inherit the public launcher's native diagnostic boundary. Its IPC cap is post-deserialization, not a universal hostile-worker memory bound; hostile Node configuration before launcher startup is outside the guarantee. No source is altered by this documentation task.

## Data flow and target differences

Experimental discovery → pre-traversal exclusions → permitted-file read/reparse → Tree-sitter extraction → sync reconciliation → atomic main-head CAS. Append-only element/commit rows and reachability supply history. [Weighted lexical retrieval](../../packages/core/src/retrieval.ts:69) uses typed two-hop expansion and episode budget reservation; no vectors or watch are implemented. [Scan results](../../packages/indexing-kilo/src/index.ts:179) are reparsed from permitted sources rather than trusted editable cache entries; [current state](../../packages/core/src/state.ts:36) is reconstructed from authoritative committed rows, not an incremental cache fast path. CLI reads remain pure. Removed trusted fast paths are an intentional safety-first tradeoff, with no performance benchmark. [Supersession](../../packages/core/src/retrieval.ts:175) requires current live hypothesis episode endpoints on ingestion and retrieval; protected/ineligible references cannot demote records. [Snippets](../../packages/core/src/retrieval.ts:51) carry an explicit untrusted flag and string value wrapper, not a bare string. [CocoaPods exclusions](../../packages/indexing-kilo/src/index.ts:17) are Windows-normalized before traversal or reads.

[Swift parsing](../../packages/indexing-kilo/src/treesitter.ts:675) is isolated in a bounded baseline-only subprocess after an observed fatal in-process V8 compile failure. [Storage read results](../../packages/storage-lance/src/index.ts:90) are deep copies on hits/misses. [Format-2 migration](../../packages/cli/src/index.ts:529) and [backup/restore](../../packages/cli/src/index.ts:325) are explicit CLI operations, not implicit cache repair; migration/store replacement requires separate human authorization. The permanent repository store currently remains unmigrated, so source sync remains blocked; an implementation episode write was independently verified through read-only public context/history, with stale source anchors (see the current handoff).

The CLI [lazy-loads storage](../../packages/cli/src/index.ts:280), allowing help without native storage loading. [Import resolution](../../packages/indexing-kilo/src/index.ts:63) restricts targets to supported code extensions, not Markdown/unknown-extension guesses. Init publication relies on local table-directory rename and config hard-link behavior; crash cleanup/durability are not established ([limitations](../experiment-handoff.md)).

Repository symbols use one-dimensional extents in the unified spatial model; moving-object fixtures exercise the same model ([purpose](../OSG_MVP_SPEC.md:51), [extent](../OSG_MVP_SPEC.md:444)). Development documentation stays separate from future runtime data ([layout](../OSG_MVP_SPEC.md:193)).

No knowledge graph is generated to document these boundaries.
