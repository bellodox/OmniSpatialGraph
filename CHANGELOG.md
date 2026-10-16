# Changelog

Notable changes, not a test transcript. The package remains private at **0.1.0-prototype.0**; no release or formal G0–G6 acceptance is claimed. Attributed proof and review boundaries live in the [handoff](docs/public-prototype.md).

## [Unreleased]

### Fixed

- 2026-10-16: Swift extraction failures now explicitly map to exit 1/internal in backend and public launcher, with the static path-free message “Swift extraction failed; scan aborted before committing”. The [public regression and fresh independent proof](docs/public-prototype.md#evidence) cover malformed output/crash, graph preservation and child cleanup: typecheck/build/test exits 0, **132 pass/0 fail/0 skip**, all 24 Swift cases passed, no suite retry. Closing parent OSG follow-up and final external re-review/security assessment remain pending, not approval.
- 2026-10-16: Swift helper requests/responses have named 16 MiB caps and strict validation; failure terminates the child and aborts scanning before commit. Derived vector format 2 binds ordered metadata and bytes, rejects mixed/invalid/nonunit caches and uses defensive cosine; publication races fall back to lexical search, not partial ranking. Failure-injection tests now use a Node-22.0-compatible asynchronous loader seam.
- 2026-10-15: Context budgets now measure the [public warning envelope](packages/cli/src/index.ts:645); the [regression](tests/embeddings.test.mjs:127) moved RED (415 estimated tokens/389 budget) → GREEN. [Post-fix evidence](docs/public-prototype.md#evidence) is typecheck/build exit 0 and 11 focused passes; the interrupted full run is inconclusive. Historical 100-pass evidence predates this fix, not final-code proof.
- 2026-10-15: `doctor` no longer reports a state cache written for an older head as a fault; it is not read as evidence. A cache claiming the current head is still compared row by row.
- 2026-10-15: Swift files are parsed by [one persistent baseline-only child per scan](packages/indexing-kilo/src/treesitter.ts:680) instead of one process per file, reducing repeated startup overhead without guaranteeing whole-scan deadlines. Requests time out after 60 seconds; the later continuation above restores bounded request/response caps. The child is closed when the scan ends.
- 2026-10-15: TypeScript is development-only, no longer bundled or declared by the provider at runtime; the [package metadata regression](tests/package.test.mjs:7) checks root/provider manifests and lockfile consistency.

### Added

- 2026-10-16: Separate opt-in [real-model proof](tools/real-model-proof.mjs) with pinned model acquisition, offline reload/read-purity checks and one successful controlled paraphrase; no generalized retrieval-benefit claim. Added [primary-source licensing evidence](docs/third-party-licenses.md) and corrected bundle-versus-grammar notices; human legal/native redistribution obligations remain open.
- 2026-10-15: Optional meaning-based search. `embed` builds a derived vector index (`Xenova/all-MiniLM-L6-v2` through the separately installed `@huggingface/transformers`) under `.osg/cache`; `context --task` merges vector matches into the keyword seeds and marks each as `keyword`, `meaning` or `both`. Off by default, never downloads during reads, falls back to keywords with `VECTORS_UNAVAILABLE`. Benefit on real tasks is unmeasured.
- 2026-10-15: Tree-sitter WebAssembly parsing for TypeScript, JavaScript, Python, Go, Rust, Java, C#, C, C++, Ruby, PHP, Kotlin, Swift and Solidity. TypeScript/JavaScript identities remain compatible with the earlier compiler provider; missing grammars warn and use a limited fallback. Added unique-name call resolution and exclusions for vendor, virtual-environment and CocoaPods directories.
- 2026-10-15: Format-2 migration with dry run, verified non-pruned pre-migration backup, append-only reindexing and one-to-one legacy episode relinking for Python/Go/Rust/Java. Older formats block sync; newer unsupported formats are refused.
- 2026-10-15: Verified backup listing and replacement restore with staging, pre-restore safety copy, rollback, metadata and format restoration. Replacement restore requires stopped writers and human authorization.
- 2026-10-15: Identifier-aware weighted lexical recall, typed two-hop expansion, directory/cochange relationships, episode tags/supersession, source anchors, Git provenance, body-hash rename relinking, time/commit context, diff, stats and health checks. Reads remain pure; derived caches are not authoritative.
- 2026-10-14: Private packaged prototype with an isolated public worker launcher, five typed API exports, bundled dependencies, strict first-party file allowlist and installed process showcase.
- 2026-10-14: Standalone CLI experiment for indexing, persistent episodes, context, entity history, verification and graph-authoritative export recovery; [cross-agent memory demonstration](docs/agent-memory-demo.md).
- 2026-10-13: Human-adopted [MVP specification 2.0](docs/OSG_MVP_SPEC.md:926), root agent entrypoints and a maintainer wiki (since consolidated into [flat documentation](docs/operations.md#documentation-roles)). Specification prototype results are external historical evidence, not repository gate acceptance.

### Changed

- 2026-10-16: Declared exact optional Transformers.js 4.3.1, supporting retained Sharp 0.35.5 in the scoped checkout dependency arrangement. LanceDB remains required at 0.40.0 but is removed from root bundle metadata for npm validity; Arrow stays 18.1.0. Root overrides do not propagate to consumers; no consumer parity/distribution claim. The [handoff](docs/public-prototype.md#evidence) preserves the historical **131-pass** validation before the final public error-map fix; latest proof is recorded above.
- 2026-10-15: Reconciled current docs for optional/default-off embeddings, persistent Swift requests and other-head doctor caches; repaired removed-wiki links while retaining historical evidence and unresolved human risks. Real-model validation is not claimed.
- 2026-10-15: Checkout metadata and license files declare Apache-2.0; the package remains private. The frozen specification's MIT description and third-party redistribution conditions still require human reconciliation.
- 2026-10-15: Human-authorized repository migration completed to format 2, preserving workspace identity, original rows/episodes and verified backup. Ordinary task-authorized sync/remember is available again; ambiguous declarations are skipped with warnings.
- 2026-10-15: OSG is the sole operational memory; the then-wiki, now [flat durable documentation](docs/operations.md#documentation-roles), is human-facing derived documentation, not a parallel task diary. No legacy-memory or documentation-graph workflow is active.
- 2026-10-15: Consolidated authored documentation around current usage, durable rationale, bounded proof and unresolved risks; removed redundant completed plans and superseded handoffs. Specifications remain frozen.

### Fixed

- 2026-10-15: Current mandatory exclusions, supported-file rules, ancestor ignores and static path/link checks gate source hashing/snippets even for historical context. Snippets use explicit untrusted value wrappers. Historical metadata is retained, not erased.
- 2026-10-15: Supersession write/read checks independently require current live hypothesis episodes; protected, retracted, malformed and self references cannot acquire supersession authority.
- 2026-10-15: State is reconstructed from committed rows and permitted sources are reparsed instead of trusting editable caches. Doctor added full authoritative-row/head/unique-ID checks for well-formed forged/stale caches; the later fix above intentionally ignores other-head caches, retaining full same-head checks.
- 2026-10-15: Defensive storage copies isolate caller mutation on cache hits/misses; restored four total CAS attempts with 50–250 ms jitter. Concurrency tests accept bounded initial conflicts while requiring exactly-once final persistence after one caller recovery.
- 2026-10-15: Swift parsing moved to a bounded baseline-only subprocess after an observed fatal in-process V8 compilation failure; the later persistent-child change is recorded above. Failure-preservation and performance limits remain [open](docs/limitations.md#separately-authorized-follow-ups).
- 2026-10-14: Public launcher contains native worker diagnostics, validates one result envelope and preserves coded exits/recovery metadata. Direct APIs and hostile pre-launch Node configuration are outside that boundary.
- 2026-10-14: Sharp 0.35.5 override/bundling resolved the recorded version-specific audit findings. Transformers' incompatible Sharp range remained unresolved; images/embeddings were disabled in that historical scope. Later optional embedding support is not risk approval.
- 2026-10-14: Static hard-link refusal, atomic ignore replacement, pre-read nested/Windows-case exclusions and public protected-state rejection. Sharing-failure recovery is path-free; injected tests are not hostile TOCTOU or real OS-lock proof.
- 2026-10-14: Null-time closing, initial ROOT/staged concurrent initialization, missing-config/native-load classification, duplicate import edges, malformed stored JSON/config, commit-prefix resolution and supported-extension import handling. Canonical omission semantics remain unchanged with explicit golden fixtures.
