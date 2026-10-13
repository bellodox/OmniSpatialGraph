# G0 architecture and feasibility dossier

## Status and authority

2026-10-13. **Three reduced G0 runtime checks pass within the measured single-writer Windows process-crash scope. Final security/review dispositions are complete; ready for explicit HUMAN G0 REVIEW, not human acceptance or G1.** Security: NO BLOCKING under trusted single-developer/single-writer use only. Code Reviewer: APPROVE WITH SUGGESTIONS, no G0 blockers. Explicit human acceptance remains pending; G1 is blocked and unstarted. This report does not accept or freeze the [contract candidate](contracts-proposal.md) or grant permission to copy [upstream candidates](upstream-ledger.md).

The [concept scope](../OmniSpatialGraph_Concept_Test_Scope.md:34) overrides conflicting broader [v0.5 requirements](../OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:280). The user explicitly retains the [human acceptance gate](../../tasks/plan.md:7). Original specifications are preserved. Root has no production application, CLI or manifest; the isolated experiment is an exception, not G1.

## Measured environment and reproducibility

[Manifest](../../experiments/g0/package.json:6), [SDK assertions](../../experiments/g0/sdk-probe.ts:11) and [independent evidence](../../experiments/g0/independent-evidence.json:28): Node 24.14.1, npm 11.11.0, Windows 10 x64 (10.0.19045.6466), Lance SDK/native package 0.40.0, Arrow 18.1.0, TypeScript 7.0.2 with explicitly pinned native Windows compiler, and Node types 22.20.5. The runtime was observed, not installed by the experiment. SDK source revision: b1b080b97c3edd2fd9f2aae8a3b71ff19487b1f8. Manifest engine range is not evidence of execution on other runtimes.

From the repository root, runnable pinned experiment commands are [`npm --prefix experiments/g0 run install:locked`](../../experiments/g0/package.json:11) then [`npm --prefix experiments/g0 run verify`](../../experiments/g0/package.json:17). They are **not** production setup or invented build commands. Installation omits optional dependencies and disables lifecycle scripts; the Windows native packages are explicit required pins. Verification runs typecheck, unit, SDK, batch, crash and cleanup sequentially ([runner](../../experiments/g0/verify.ts:24)); it writes evidence and can overwrite latest summary fields while appending command runs. Preserve existing records before a future rerun. Do not run concurrent probes on the same experiment environment.

The [Code handoff](../../experiments/g0/handoff-evidence.json:4) records locked install and outer verification exit 0. The simplifier reported no source edits and typecheck/unit exit 0. These are earlier results, not a fresh independent install. The independent run used existing dependencies and recorded **all six subcommands exit 0 in 65.044 seconds**, but **outer exit is null** ([commands](../../experiments/g0/independent-evidence.json:189)). Its outer PowerShell deadline wrapper remained alive after probes finished and was stopped; exact blocking call was not established ([failure record](../../experiments/g0/independent-evidence.json:246)). Do not claim a fresh outer verification exit 0 or successful end-to-end deadline. A future watchdog must independently cover launch, execution and output collection, retain task identity, and target only its own verified children.

## Outcome matrix

| Check | Outcome | Original evidence and assertion |
| --- | --- | --- |
| SDK pin/native load and reopen | Pass, measured target only | [SDK source](../../experiments/g0/sdk-probe.ts:17); [pins/native load](../../experiments/g0/independent-evidence.json:28). Installed versions agree with lock pins; native load succeeds; baseline reopens with three rows. |
| One version per nonempty mixed batch | Pass | [Batch assertion](../../experiments/g0/batch-probe.ts:35); [two publications](../../experiments/g0/independent-evidence.json:138): versions 1→2→3, one update plus two inserts each (including marker). |
| Exact historical/current reopen | Pass for this fixture | [Complete content comparisons](../../experiments/g0/batch-probe.ts:54); [snapshots](../../experiments/g0/independent-evidence.json:168): exact 3/5/7 rows and unmatched sentinel preserved. Not semantic branch/history implementation. |
| Successful non-killed control | Pass | [Independent control](../../experiments/g0/independent-evidence.json:71): all 100,000 data rows checked, one marker, total 100,004 including three baseline rows, version 2. |
| Outstanding native-write interruption/recovery | Pass at one observed placement | [Controller predicate](../../experiments/g0/crash-probe.ts:80); [independent interruption](../../experiments/g0/independent-evidence.json:94): new 35,880,544-byte native file observed before kill; no completion acknowledgement; writer exits nonzero; fresh recovery sees zero data/markers, three baseline rows, version 1. |
| Atomic-visibility/uniqueness invariants | 3 passed, none skipped | [Invariant source](../../experiments/g0/invariant-probe.ts:5); [audit](../../experiments/g0/independent-evidence.json:275). Reject partial rows with or without marker, marker without rows, all rows without marker and duplicate markers. |
| Two original force-kill attempts | Inconclusive, not crash passes | [100,000-row attempt](../../experiments/g0/crash-100000-evidence.json), [200,000-row attempt](../../experiments/g0/crash-200000-evidence.json). Publication completed before effective termination; historical records retained. |
| Independent outer deadline/exit capture | Failed/stalled wrapper; exit not captured | [Failure record](../../experiments/g0/independent-evidence.json:246). Successful inner probes do not repair outer reporting. |
| Final review/security/readiness | Complete; ready for human G0 review | Supplied final dispositions recorded below; [T8](../../tasks/plan.md:189) complete, no human acceptance. |
| Human G0 acceptance / G1 entry | Pending / blocked | [Gate](../../tasks/plan.md:7); authorization of G0 is not acceptance. |

## What the experiment proves, and does not prove

The fixture validates marker-plus-data publication through one merge, after-publication version lookup, exact mixed-batch reopen and one interrupted Windows process recovery. [Recovery](../../experiments/g0/recovery-probe.ts:18) checks counts, complete successful control payloads/keys/kinds/branch/marker, historical baseline count and sentinel. Partial subsets fail independently of marker equivalence. The [fixture identity encoding](../../experiments/g0/rows.ts:21) is explicitly not the production identity contract.

A nonzero new native file establishes that native storage work began, **not** durable publication. Five-millisecond polling and OS scheduling cannot identify an exact native instruction. Windows unconditional PID termination is not a POSIX execution test, power-loss/fsync guarantee, or every possible crash placement. Baseline backups were made while closed, but backup restore and byte-for-byte directory restoration were not proven. See [independent limits](../../experiments/g0/independent-evidence.json:294).

This does not prove concurrency, retention, native branches, branch-column semantic merges, long history, large repository performance, provider replacement/A→B migration, embeddings, GraphRAG, spatial/G6 fixtures, host permissions or production acceptance. Later concept acceptance still requires v0.5 tests 1, 2, 3, 4, 6, 7 and 9 ([scope](../OmniSpatialGraph_Concept_Test_Scope.md:43)); none is claimed passed end-to-end by these probes. The storage fixture supplies partial evidence for test 4, not the whole product test.

## Proposed architecture disposition

Keep one plain-row graph table and atomically publish rows plus semantic marker; discover native version afterwards. Disable optimization/cleanup and back up closed table directories. Document single-writer use as the minimal candidate; a lock-file enhancement must not silently promise safe stale-PID auto-deletion. Preserve core→contracts/narrow ports only; only the storage adapter imports Lance/Arrow. CLI and direct library consumers compose adapters separately ([candidate](contracts-proposal.md), [requirements](../OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:95)).

Branch column, fork-pinned parent lineages, resolved snapshots, compatible-key merge and whole-batch conflict rejection remain proposed, unmeasured behavior. No empirical branch/model guarantee follows from native table checkout. Identity continuity on rename remains a human design choice, not solved by location/hash stability. Applicable grammar/native-watcher/dependency rights require approval before source copying ([ledger](upstream-ledger.md)).

## Future measurement plan — not G0 benchmark results

After separately authorized implementation, measure full sync versus one-function changes: total time, parsed files/facts, mutation count, allocations/peak memory, table bytes/version growth, reopen/mapping rebuild, exact historical query/diff latency and citation correctness. Use fixed datasets, cold/warm repetitions and recorded pins/environment; compare distributions rather than a single observed merge. Measure lexical/graph fallback with embeddings absent. Large control counts here are crash-window fixtures, not repository-scale throughput guarantees. Concurrency/retention/provider swaps remain separate later questions.

## Preservation and remaining work

[Independent cleanup](../../experiments/g0/independent-evidence.json:15) records no live task children, no temporary DB/build/backups and retained ignored dependencies; source and prior evidence hashes unchanged. This documentation task does not alter experiment sources/evidence, dependency pins, ignore policy, custom modes or harness. Filesystem MCP was not exposed; repository file tools were used transparently. Registry integrity metadata/native hash exist; signature/attestation verification was not performed ([historical limitations](../../experiments/g0/independent-evidence.json:300)). Final dependency audit outcomes are recorded below, not signature/attestation claims.

Required next dispositions: explicit human acceptance, candidate design approval and applicable reuse-rights approval before affected copying (not a blanket G1 blocker when source remains uncopied). Existing local navigation graph predates the G0 dossier; refresh is queued, not fabricated. Wiki remains locally canonical and Git-ignored, so ordinary clones do not receive it. [Checklist](../../tasks/todo.md) tracks the boundary. G1 remains unstarted.

## Documentation validation — 2026-10-13

Read-only local validation checked 22 scoped Markdown documents, 266 local link targets, 150 line-qualified references and catalog coverage of all 12 wiki pages: zero broken targets, zero out-of-range lines and zero unindexed pages. Six conceptual JSON blocks parse; this is syntax inspection, not machine-schema/TypeScript contract acceptance. All 28 unique immutable GitHub source URLs in the ledger resolved through their raw SHA-pinned counterparts with HTTP 200. Published grammar-bundle license text and native-watcher license metadata were inspected; closure approval remains pending.

Evidence assertions confirm six independent inner exit codes 0, null outer exit and exact historical 3/5/7-row counts. Root production manifest and disposable generated/build directories are absent; ignore checks confirm wiki/local memory/dependencies remain excluded. Existing graph metadata reports analysis at 2026-10-13T11:59:27.874Z and unverified host auto-update; no refresh claim. No storage rerun, security audit or Code Reviewer verdict was produced by these documentation checks.

## Final dispositions — administrative recording, 2026-10-13

Provenance: final Security and Code Reviewer outcomes supplied by the user for recording after those reviews. This administrative update performs no fresh runtime verification or security audit. Code Reviewer performed no fresh runtime run or Git diff and read historical evidence only partially; do not inflate review coverage. Preserve six inner exits 0 in 65.044 seconds, failed/stalled outer wrapper with null exit, and both original inconclusive kills.

**Security — NO BLOCKING, trusted single-developer/single-writer scope only.** Full npm audit exited 1 with three High package rollups for sharp 0.33.5 through optional Transformers 3.0.2; these optional packages were NOT installed and NOT reachable in the probes. Optional-omitted audit exited 0 with zero advisories. Preserve the [optional-disabled, scripts-disabled locked install](../../experiments/g0/package.json:11). Before provider activation, patch the affected closure, verify compatibility and re-audit; do not blindly downgrade the SDK. Supplied checks found 34 installed versions matching the lock and native hash, 156 lock entries using HTTPS registry URLs and SHA-512 integrity, and no secret patterns in 44 files, without credential access. These are scoped inspection/audit outcomes, not an attestation.

Nonblocking security lows: local machine paths remain in raw historical evidence; create redacted publication derivatives, never delete originals. A credible PID-reuse race is unreproduced. Junction/cleanup ownership is conditional outside the trusted layout; no escape was proven. Broader trust boundaries require separate validation.

**Code Reviewer — APPROVE WITH SUGGESTIONS; no G0 blockers, ready for HUMAN REVIEW.** Record follow-ups only, with no source changes now:

- [Crash journal classification](../../experiments/g0/crash-probe.ts:85): distinguish failed journals in future reporting; the recorded passing trial had no failed journal.
- [Registry metadata lookup](../../experiments/g0/sdk-probe.ts:16): add a network timeout in future authorized work.
- [Hardcoded installation record](../../experiments/g0/verify.ts:42): distinguish historical records from a fresh install.
- Settle relation identity and publication-key definition before G1 S3; the [relation table](contracts-proposal.md:24) and [storage key candidate](contracts-proposal.md:179) are not a settled contract.
- Follow up assertion-message callback cleanup; fixture JSON hashing is not production canonical serialization.

**Readiness:** three reduced runtime checks pass; final security/review disposition checks are complete. Explicit human G0 acceptance and separate G1 authorization remain blocking gates; every G1 slice is unstarted. Canonical JSON, rename continuity, relation identity/key definition and migration decisions remain unresolved; deferred A→B migration proof is not reinstated. Selected grammar/native/dependency reuse approval is required before affected copying, not blanket permission or a blanket G1 prohibition for uncopied source.

Administrative validation: read-only checks exited 0 across 21 Markdown documents, 267 local links and 158 line-qualified references, with zero broken targets or out-of-range lines. All 12 wiki pages are indexed. All 32 captured SHA-256 preservation hashes match, including experiment source/evidence/configuration, original specifications, existing harness/rules, ignore files and the preserved brief. The brief's existing links also resolve. No fresh runtime, server or security audit was started; the ledger remains unchanged.
