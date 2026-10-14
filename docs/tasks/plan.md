# Standalone CLI experiment plan

2026-10-14 · **Historical original experiment plan.** Its authorizations, local-memory procedure and risk status below describe that stage, not current task instructions. The [current installable prototype handoff](../public-prototype.md) and [current checklist](public-prototype.md) supersede current CLI/API, audit, review and distribution status. Operational memory is now OSG only; legacy-bank updates are not authorized. The [earlier checklist](todo.md) retains unproved broader targets; no formal acceptance claimed.

## Scope and authority

Build a small, standalone CLI experiment covering durable code indexing and agent memory. Current human instruction preauthorizes installs, builds, tests and continuation within the [planned repository layout](../OSG_MVP_SPEC.md:193), without intermediate human pauses. This is **not** formal G0–G6 acceptance, resolution of [Q1–Q9](../OSG_MVP_SPEC.md:153), or permission to copy upstream code/assets. It does not replace the MVP specification.

The original planning task created this plan and the [dependency-ordered checklist](todo.md). Current human instruction authorizes necessary experiment docs/wiki and short local context updates, not code changes or delegation. Preserve the entire [specification](../OSG_MVP_SPEC.md), including §22, unrelated work and harness/mode/hook/index/ignore settings. Absent paths returned by semantic search are stale navigation, not implementation evidence. Appendix A/§18 remain historical external evidence, not repository test passes. The frozen [status log](../OSG_MVP_SPEC.md:922) does not grant experimental gate acceptance.

## Experiment decisions

- Retain LanceDB 0.40.0, Arrow 18.1.0 and Node 22/24 LTS; retain optional native binaries for Windows x64 and Linux x64. Select and lock exact compatible TypeScript, hashing and test-tool versions during slice 1, recording resolved versions rather than assuming the installed host matches the plan ([pins](../OSG_MVP_SPEC.md:132)).
- Keep contracts/core independent of adapters; only storage imports LanceDB/Arrow. Independently write the provider using the TypeScript compiler API in the [existing provider slot](../OSG_MVP_SPEC.md:206). Its package slot is not a claim of upstream provenance. **Non-Tree-sitter extraction is an explicitly authorized experimental deviation** from [§11](../OSG_MVP_SPEC.md:607), not a permanent decision to replace Approach A.
- Use canonical integer-only hashing, append-only element/commit rows, one atomic head-CAS batch, row-based history, pure reads and runtime confinement ([guardrails](../OSG_MVP_SPEC.md:169), [protocol](../OSG_MVP_SPEC.md:507)). No lockfile-based writer serialization or Lance-version time travel.
- Use lexical seeds and bounded graph traversal with current-source citations and staleness checks. No vectors, embeddings, watch, server/daemon, approval command/status promotion, host integration, signing or OpenSpeX emission. Unsupported operations fail explicitly ([retrieval](../OSG_MVP_SPEC.md:641), [CLI contract](../OSG_MVP_SPEC.md:727)).
- Source/toolchain/tests stay in the planned source layout; runtime saves stay only in each fixture workspace's runtime folder. Never store raw source text or author identity in graph rows; never open the host index. Existing repository ignore policy is preserved; init's documented ignore additions are tested in disposable fixtures only.

## Dependency order and checkpoints

| Slice | Working increment | Depends on | Focused scope |
| --- | --- | --- | --- |
| 1 | Hash/storage plus init | None | Minimal pinned scaffold, canonical hashes, schema/CAS, init and focused tests |
| 2 | Compiler API provider plus sync | 1 | Discovery/extraction, identity reconciliation, sync and incremental tests |
| 3 | Remember/context/history | 2 | Persistent episodes, lexical retrieval/citations, row history and memory tests |
| 4 | Verify/export recovery | 3 | Hash verification, replayable episode export, isolated recovery tests |
| 5 | Separate-process tests | 4 | CLI lifecycle, CAS races, fresh reads, forced termination and exit tests |
| 6 | Docs and reviews | 5 | Minimal usage/limitations, proof record, Code Reviewer and scoped security assessment |

Each slice targets at most about five authored files per focused increment; split an oversized increment internally before editing, without adding scope. The checklist supplies grouped acceptance criteria and verification for each slice.

After slices **2, 4 and 6**, run the cumulative focused suites and build, inspect actual exits, and check preservation/confinement. These are automated engineering checkpoints: **continue immediately when checks pass; no human pause is required**. Failures require repair and rerun; unknown or inconclusive results are not passes. Formal gate acceptance remains human-only and outside this experiment.

## Verification and risks

Executable [manifest scripts](../../package.json:26) and direct CLI examples now exist; exact invocations, reported exits and trial counts are in the [handoff](../experiment-handoff.md). The [test catalogue](../OSG_MVP_SPEC.md:786) guides proofs, not a claim all MVP tests are implemented. Forced termination, Linux and other missing targets remain unproved; final scoped reviews are complete, not clean-security, distribution or formal gate clearance. Broader evidence requires separate authorization; the human dependency-risk decision remains outstanding.

- Native/CAS risk: prove installed pins, optional lock entries, null extent/list schema, canonical golden hashes, immutable historical rows, atomic publication and stale-loser invisibility early; strengthen with separate processes later.
- Indexing risk: prove stable IDs independent of line numbers, overload reorder/ambiguity warnings, changed citations/source hashes, deletion/retraction with edge integrity, unchanged-file skips, return-to-prior-content and whole-sync no-op. Document unsupported extraction cases instead of inventing facts.
- Memory/recovery risk: prove restart persistence, hypothesis-only episodes, untrusted text/provenance, deterministic bounded context, pure stale reads, tamper detection and idempotent export rebuilding after post-commit export failure.
- Process/platform risk: use owned child processes and disposable fixture stores only. Capture Windows results; run Linux separately when available and report unavailable coverage honestly. Missing platform coverage cannot become a formal gate pass.

Open decisions remain Q1–Q9 under their defaults. This bounded experiment avoids their unresolved features; record any new dependency on them without deciding it. Deliver a runnable experiment with reproducible proofs and clear limitations—not gate dossiers or an MVP acceptance claim.
