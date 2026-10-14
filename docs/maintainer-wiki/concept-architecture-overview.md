# Experimental Source Map and Target Architecture

The [specified design](../OSG_MVP_SPEC.md:255) remains the canonical target. The bounded standalone experiment is CLI-first and daemon-free; it does not implement the full MVP. See the [handoff](../experiment-handoff.md) for tested behavior and gaps.

| Boundary | Actual experimental source |
| --- | --- |
| Contracts | [Types and graph port](../../packages/contracts/src/index.ts:1) |
| Core | [Canonical hashing](../../packages/core/src/hash.ts:7), [commits/snapshots/verification](../../packages/core/src/graph.ts:143), [sync/memory/history](../../packages/core/src/memory.ts:9); no implemented merge CLI |
| CLI | [Argument parsing, runtime confinement, envelope packing and export wiring](../../packages/cli/src/index.ts:12) |
| Experimental provider | [Independent compiler API scan](../../packages/indexing-kilo/src/index.ts:23), not Tree-sitter/Approach A or a host-index adapter |
| Storage adapter | [Pinned LanceDB/Arrow schema, initial-data ROOT/private staging publication and atomic head CAS](../../packages/storage-lance/src/index.ts:34) |

Target boundaries: [dependency rules](../OSG_MVP_SPEC.md:272). Build exposes separate core modules, not a barrel export. No source directories are created or altered by this documentation task.

## Data flow and target differences

Experimental discovery → file hashing → compiler API extraction → sync reconciliation → atomic main-head CAS. Append-only element/commit rows and reachability supply history. Context uses lexical seeds and bounded traversal; no vectors or watch are implemented. Sync rescans source; no-op publication does not imply parse skipping. [Source evidence](../../packages/core/src/memory.ts:9) and [target pipeline](../OSG_MVP_SPEC.md:622) must not be conflated.

The CLI [lazy-loads storage](../../packages/cli/src/index.ts:221), allowing help without native storage loading. [Import resolution](../../packages/indexing-kilo/src/index.ts:60) restricts targets to supported code extensions, not Markdown/unknown-extension guesses. Init publication relies on local table-directory rename and config hard-link behavior; crash cleanup/durability are not established ([limitations](../experiment-handoff.md)).

Repository symbols use one-dimensional extents in the unified spatial model; moving-object fixtures exercise the same model ([purpose](../OSG_MVP_SPEC.md:51), [extent](../OSG_MVP_SPEC.md:444)). Development documentation stays separate from future runtime data ([layout](../OSG_MVP_SPEC.md:193)).

No knowledge graph is generated to document these boundaries.
