# Changelog

Notable changes, not a test transcript. The package remains private at **0.1.0-prototype.0**; no release or formal G0–G6 acceptance is claimed. Attributed proof and review boundaries live in the [handoff](docs/public-prototype.md).

## [Unreleased]

### Added

- 2026-10-15: Tree-sitter WebAssembly parsing for TypeScript, JavaScript, Python, Go, Rust, Java, C#, C, C++, Ruby, PHP, Kotlin, Swift and Solidity. TypeScript/JavaScript identities remain compatible with the earlier compiler provider; missing grammars warn and use a limited fallback. Added unique-name call resolution and exclusions for vendor, virtual-environment and CocoaPods directories.
- 2026-10-15: Format-2 migration with dry run, verified non-pruned pre-migration backup, append-only reindexing and one-to-one legacy episode relinking for Python/Go/Rust/Java. Older formats block sync; newer unsupported formats are refused.
- 2026-10-15: Verified backup listing and replacement restore with staging, pre-restore safety copy, rollback, metadata and format restoration. Replacement restore requires stopped writers and human authorization.
- 2026-10-15: Identifier-aware weighted lexical recall, typed two-hop expansion, directory/cochange relationships, episode tags/supersession, source anchors, Git provenance, body-hash rename relinking, time/commit context, diff, stats and health checks. Reads remain pure; derived caches are not authoritative.
- 2026-10-14: Private packaged prototype with an isolated public worker launcher, five typed API exports, bundled dependencies, strict first-party file allowlist and installed process showcase.
- 2026-10-14: Standalone CLI experiment for indexing, persistent episodes, context, entity history, verification and graph-authoritative export recovery; [cross-agent memory demonstration](docs/agent-memory-demo.md).
- 2026-10-13: Human-adopted [MVP specification 2.0](docs/OSG_MVP_SPEC.md:926), root agent entrypoints and the historical wiki (now [flat durable documentation](docs/operations.md#documentation-roles)). Specification prototype results are external historical evidence, not repository gate acceptance.

### Changed

- 2026-10-15: Consolidated durable documentation into four flat documents under docs; transferred unique wiki content, repaired navigation and removed the obsolete wiki/task directories.

- 2026-10-15: Checkout metadata and license files declare Apache-2.0; the package remains private. The frozen specification's MIT description and third-party redistribution conditions still require human reconciliation.
- 2026-10-15: Human-authorized repository migration completed to format 2, preserving workspace identity, original rows/episodes and verified backup. Ordinary task-authorized sync/remember is available again; ambiguous declarations are skipped with warnings.
- 2026-10-15: OSG is the sole operational memory; durable docs are human-facing derived documentation, not a parallel task diary. No legacy-memory or documentation-graph workflow is active.
- 2026-10-15: Consolidated authored documentation around current usage, durable rationale, bounded proof and unresolved risks; removed redundant completed plans and superseded handoffs. Specifications remain frozen.

### Fixed

- 2026-10-15: Current mandatory exclusions, supported-file rules, ancestor ignores and static path/link checks gate source hashing/snippets even for historical context. Snippets use explicit untrusted value wrappers. Historical metadata is retained, not erased.
- 2026-10-15: Supersession write/read checks independently require current live hypothesis episodes; protected, retracted, malformed and self references cannot acquire supersession authority.
- 2026-10-15: State is reconstructed from committed rows and permitted sources are reparsed instead of trusting editable caches. Doctor compares full authoritative rows, head and unique IDs, detecting well-formed forged/stale caches.
- 2026-10-15: Defensive storage copies isolate caller mutation on cache hits/misses; restored four total CAS attempts with 50–250 ms jitter. Concurrency tests accept bounded initial conflicts while requiring exactly-once final persistence after one caller recovery.
- 2026-10-15: Swift parsing runs in a bounded baseline-only subprocess after an observed fatal in-process V8 compilation failure. Failure-preservation and performance limits remain [open](docs/limitations.md#separately-authorized-follow-ups).
- 2026-10-14: Public launcher contains native worker diagnostics, validates one result envelope and preserves coded exits/recovery metadata. Direct APIs and hostile pre-launch Node configuration are outside that boundary.
- 2026-10-14: Sharp 0.35.5 override/bundling resolved the recorded version-specific audit findings. Transformers' incompatible Sharp range remains unresolved; images/embeddings remain disabled.
- 2026-10-14: Static hard-link refusal, atomic ignore replacement, pre-read nested/Windows-case exclusions and public protected-state rejection. Sharing-failure recovery is path-free; injected tests are not hostile TOCTOU or real OS-lock proof.
- 2026-10-14: Null-time closing, initial ROOT/staged concurrent initialization, missing-config/native-load classification, duplicate import edges, malformed stored JSON/config, commit-prefix resolution and supported-extension import handling. Canonical omission semantics remain unchanged with explicit golden fixtures.
