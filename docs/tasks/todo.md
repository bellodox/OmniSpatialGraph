# Standalone CLI experiment checklist

2026-10-14 · Agreed experimental implementation, independent tests, simplification, documentation and final reviews complete. Follow the [plan](plan.md) and [reported evidence/handoff](../experiment-handoff.md). Checked items describe the narrower evidence-backed experiment, not formal acceptance; unproved original targets remain explicit below. Documentation did not rerun application tests.


Final targeted Code Reviewer: **APPROVE WITH SUGGESTIONS**, no concrete blocker. Final Vulnerability Checker: **NO BLOCKING FINDINGS** within targeted Windows private-experiment scope; mandatory-case application BLOCK resolved, original hard-link/protected-state clearance carried forward. No clean-security verdict or distribution clearance. Prior verified build/typecheck/full suite exits 0, 35 pass/0 fail/0 skip were not rerun by checker. Final focused security run exit 0: 5 pass/0 fail/0 skip; in-memory compiler comparison matched seven existing outputs, zero temporary files, status unchanged ([provenance](../experiment-handoff.md)). Earlier targeted 2-pass and 33 full/7 focused results remain historical.

Windows mandatory exclusions case-fold BEFORE traversal, nested ignore-file reads and content reads; attempted negations fail. Coverage includes mixed-case runtime, task, harness, Git, analysis, build/dependency directories, sensitive filenames, environment-file variants and declaration extensions. Original paths, logical IDs, hash case semantics and collision detection are unchanged. Fresh stores contain no excluded facts/rows/history/context; repeat sync adds no rows. ([provider](../../packages/indexing-kilo/src/index.ts:44), [fresh-store proof](../../tests/security.test.mjs:214)).

**Affected-store privacy warning:** standard sync retracts previously leaked facts from current state/context only. Every original non-head row is preserved; append-only history and old-commit views remain accessible. Use a **fresh disposable workspace/store** for privacy, not a purge or historical-cleanup claim. ([affected-store proof](../../tests/security.test.mjs:284)).

Known Low diagnostic-path disclosure remains. Image/embedding features remain disabled; no reachable exploit was identified. Dependency audit still has 3 High entries via sharp; human owner-reviewed disposition is required before enablement/distribution and by 2026-10-21. No Linux/macOS/crash/power-loss/TOCTOU/network-filesystem/large-store evidence is claimed.

## 1. Hash/storage plus init

Create the smallest usable pinned CLI/storage path. **Dependencies:** none. **Scope:** small increments of ≤5 authored files, covering the [root toolchain and contracts/core/storage/CLI slots](../OSG_MVP_SPEC.md:193) and focused contract/storage tests.

- [x] Lock exact tooling versions and retained optional native packages; reported loading on Windows x64 Node 24.14.1 with LanceDB 0.40.0/Arrow 18.1.0 ([pins](../../package.json:12), [lockfile](../../package-lock.json)). Linux loading remains unverified.
- [x] Prove canonical normalization/integer rejection and 22 literal input/byte/hash triples; use snake_case columns and nullable variable-length int64 lists ([independent goldens](../../tests/independent.test.mjs:54), [contract tests](../../tests/contract.test.mjs:11), [schema](../../packages/storage-lance/src/index.ts:8)).
- [x] Init/root head, CAS, immutable history, idempotent/late retries and invalid key/reference rejection covered by [graph tests](../../tests/graph.test.mjs:68) and [init lifecycle](../../tests/independent.test.mjs:85). Added [null-time closing](../../tests/graph.test.mjs:10), [initial ROOT/concurrent preservation](../../tests/graph.test.mjs:32), [nonmutating headless failure](../../tests/graph.test.mjs:47) and [canonical omission goldens](../../tests/contract.test.mjs:11); headless failure is modeled, not forced-kill proof.

**Verification:** Latest reported Windows x64 Node 24.14.1 build/typecheck/full suite exit 0; 35 pass/0 fail/0 skip, targeted mandatory-exclusion/reconciliation tests 2 pass; prior 33 full/7 focused, 31 full/3 security and earlier 28/20-pass evidence historical. Three extra genuine rounds of four fresh plus four repeated initializers passed beyond historical 20-round stress. Exact scripts, lock/signature evidence and limitations are in the [handoff](../experiment-handoff.md).

## 2. Independently written provider plus sync

Write compiler API discovery/extraction and reconcile a TypeScript fixture through the CLI. **Dependencies:** 1. **Scope:** ≤5 files per increment in the [provider/core/CLI, fixture and incremental-test areas](../OSG_MVP_SPEC.md:206).

- [x] Independent compiler API provider records source hashes and exclusions, not host-index facts; limitations/provenance documented ([provider](../../packages/indexing-kilo/src/index.ts:26), [exclusion tests](../../tests/independent.test.mjs:164)). [Import resolution regression](../../tests/provider.test.mjs:8) rejects unknown-extension guesses and Markdown targets.
- [x] Windows case-insensitive nested mixed-case ignore privacy applies before reads; logical identity/hash case semantics unchanged. Other-platform case-sensitive matching untested ([regression](../../tests/security.test.mjs:156)).
- [x] Stable IDs after inserted lines/reordered overloads, ambiguity warnings and changed citations proved ([provider tests](../../tests/provider.test.mjs:24), [line 1→11](../../tests/independent.test.mjs:113)).
- [x] Changed/deleted facts reconcile, history remains and repeated sync preserves head/disk; no raw source props ([lifecycle](../../tests/independent.test.mjs:119), [source props](../../packages/indexing-kilo/src/index.ts:87)).
- [ ] Original broader targets remain unproved: explicit rename-chain fixtures, unchanged-file parse skipping and return-to-prior-content proof. Actual sync rescans sources; no-op is not skip proof.

**Verification:** run focused incremental tests, build, and init → sync → sync on a disposable fixture; compare exact IDs, deltas, citations and row counts.

### Checkpoint A — after 1–2

- [x] Reported cumulative tests/build pass; supported pins/CAS/hash/reconciliation/confinement have linked evidence. Broader missing targets above are not passes.

## 3. Remember/context/history

Add persistent memory and lexical retrieval through the CLI. **Dependencies:** 2. **Scope:** ≤5 files per increment in the [core/CLI and memory/history-test areas](../OSG_MVP_SPEC.md:206).

- [x] Hypothesis episodes, about edges, unresolved warnings and untrusted provenance implemented/tested; rules hashes explicitly unavailable ([remember](../../packages/core/src/memory.ts:37), [poisoning assertions](../../tests/independent.test.mjs:93)).
- [x] Lexical context includes relevant episode/source within whole-envelope 800-token estimate; stale citations and invalid/small-budget handling covered ([budget/purity](../../tests/independent.test.mjs:97), [usage](../../tests/independent.test.mjs:188)).
- [x] Fresh processes preserve episodes/history and old-commit views; context/history/verify preserve disk bytes and mtime ([independent lifecycle](../../tests/independent.test.mjs:85), [old view](../../tests/integration.test.mjs:115)). Status is unsupported; rename chains unproved.

**Verification:** run memory/history and poisoning-fixture tests, restart the CLI, compare budget estimates/citations, and snapshot before/after pure reads; build passes.

## 4. Verify/export recovery

Make committed graph history independently checkable and exports rebuildable. **Dependencies:** 3. **Scope:** ≤5 files per increment in the [core/CLI and recovery-test areas](../OSG_MVP_SPEC.md:206).

- [x] Verify succeeds for valid graph and stored tampering fails with exit 8, including malformed JSON ([tamper tests](../../tests/independent.test.mjs:149), [JSON regression](../../tests/independent.test.mjs:277)).
- [x] Export is rebuilt/replaced only after graph commit, not incrementally appended; post-commit export failure retains durable episode and replay restores deterministic bytes ([recovery](../../tests/integration.test.mjs:141)). Forged export is not authority ([assertion](../../tests/independent.test.mjs:128)).
- [ ] Isolated backup-copy recovery remains unproved. Existing proof is graph-authoritative export replay/restart, not a backup restore or crash durability claim.

**Verification:** run focused verify/export/recovery fault tests and build; compare graph heads, row snapshots and reconstructed export bytes.

### Checkpoint B — after 3–4

- [x] Reported cumulative tests/build pass; supported memory/budget/pure-read/export-replay proofs linked above. Backup-copy proof remains absent.

## 5. Separate-process integration tests

Exercise the implemented command paths across real process boundaries. **Dependencies:** 4. **Scope:** ≤5 files per increment in the [integration/CLI/storage-test and fixture areas](../OSG_MVP_SPEC.md:212).

- [x] Ten independent two-process CAS rounds/20 writers report one exit 0 and one exit 3 each; long-lived reader sees winners and loser commits are unreachable ([races](../../tests/independent.test.mjs:211)). Append-only/idempotent foundation checks remain in [graph tests](../../tests/graph.test.mjs:68).
- [ ] Separate public bounded-retry exhaustion proof beyond direct fixed-head CAS races is not established by the reported evidence.
- [ ] Force-terminate owned writer children during ≥12 approximately 2,000-row commits; reopen and prove complete acknowledged commits and no partial head publication. Count kills before/after acknowledgement separately; zero pre-acknowledgement kills is inconclusive. Watchdogs never kill parent/unrelated processes.
- [x] Separate-process lifecycle, pure reads, no-op, usage/config/tamper/unsupported behavior and runtime junction confinement proved ([independent tests](../../tests/independent.test.mjs:85), [integration](../../tests/integration.test.mjs:83)). Added [concurrent init](../../tests/integration.test.mjs:16), [missing config exit 6](../../tests/integration.test.mjs:42) and [isolated module-resolution injection](../../tests/integration.test.mjs:59); installed binaries were not deleted. Full per-category exit coverage is not claimed.
- [x] Exhausted EPERM/EACCES/EBUSY ignore replacement retries return STORAGE_UNAVAILABLE/exit 6 with path-free partial-init recovery guidance; rerun init preserves identity and completes ignore update. Unrelated I/O unchanged; evidence uses injection, not real OS locks ([regression](../../tests/security.test.mjs:332)).

**Verification:** run the cumulative suite/build and separate-process suite on Windows x64; repeat on Linux x64 if available with separate results. Capture each command's own exit, trial classification and row/filesystem snapshots; unavailable platforms remain explicitly unverified.

## 6. Minimal docs and final reviews

Document only supported experiment behavior and assess the finished changes. **Dependencies:** supported portions of 5. Current human instruction additionally authorizes necessary derived wiki and short local memory updates; preserve the entire specification and harness/mode/hook/index/ignore settings. No gate dossiers or persona delegation in this documentation task.

- [x] [Runnable handoff](../experiment-handoff.md) supplies exact install/build/test/CLI/core/agent/recovery examples, pins, attributed proofs, unsupported commands and honest limitations. No formal acceptance claimed.
- [x] Implementation/testing/simplification and cleanup reported complete; assertions preserved. Prior verified build/typecheck/full-suite 35-pass/0-fail/0-skip and earlier targeted mandatory-exclusion/reconciliation 2-pass evidence retained ([regressions](../../tests/security.test.mjs:29)). Prior 33 full/7 focused and 31/3 evidence historical; final checker did not rerun the full suite.
- [x] Final targeted Code Reviewer **APPROVE WITH SUGGESTIONS**, no concrete blocker; Vulnerability Checker **NO BLOCKING FINDINGS** within Windows private-experiment scope. Mandatory-case application BLOCK resolved; original hard-link/protected-state clearance carried forward. No clean-security/distribution verdict; no delegation here ([final proof](../experiment-handoff.md)).
- [ ] Human owner-reviewed dependency deferral before image/embedding enablement or distribution and by 2026-10-21: fresh audit exit 1/3 High package entries via LanceDB → Transformers → sharp 0.33.5. Previous checker found no reachable image-decoding app path; features disabled. Private experiment is not distribution clearance. Native/LGPL closure and independent clean install unverified; signature audit exit 0/114 signatures/10 attestations does not clear these risks ([advisories](../experiment-handoff.md)). Agents cannot approve deferral or arbitrarily upgrade pins.
- [x] Final scoped outcomes and exact focused command/exit recorded; no concrete blocking finding remains in agreed experiment scope. Human dependency-risk decision remains outstanding. Non-Windows case-insensitive filesystems, init staging crash cleanup and local rename/hard-link reliance remain limitations, not durability proof or pending implementation in this closure.

**Closure verification:** validate local documentation links and preservation; retain supplied final focused-test and compiler-comparison evidence. No application checks/audits or another implementation/review cycle in this documentation-only final record.

### Checkpoint C — after 5–6

- [x] Final engineering evidence, docs and scoped reviews agree; failures/inconclusive checks and outstanding human risk decision remain visible. Agreed experiment completion grants no formal gate acceptance or Q1–Q9 resolution.
