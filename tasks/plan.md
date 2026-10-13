# G0 architecture and feasibility plan

## Authority and execution boundary

Dated 2026-10-13; original planning instructions retained below as task history. G0 execution and documentation are now recorded in the [dossier](../docs/g0/architecture-feasibility.md). Three reduced runtime checks have measured evidence; final security NO BLOCKING (trusted single-developer/writer only) and Code Reviewer APPROVE WITH SUGGESTIONS complete review/readiness disposition for human G0 review. Explicit human acceptance remains pending. G1 is blocked and unstarted. Preserve unrelated work and pre-existing Git changes.

The user authorizes **G0 experiments now**, without another confirmation. This is not G1 authorization. **Explicit human acceptance of the final G0 report is required before any production G1 implementation**, retaining [v0.5 section 12](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:310).

The [concept scope](../docs/OmniSpatialGraph_Concept_Test_Scope.md:11) overrides conflicting v0.5 storage and acceptance requirements. Its three executable G0 checks are SDK pinning, one native table version per batch, and one crash-atomicity experiment. The user additionally requests pinned upstream licensing research, proposed universal contracts, and a G1 plan. These supporting deliverables do not restore deferred runtime gates.

Read in full: [v0.5](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md), [concept scope](../docs/OmniSpatialGraph_Concept_Test_Scope.md), [root guidance](../AGENTS.md), [delegating entrypoint](../CLAUDE.md), [workflows](../docs/maintainer-wiki/workflows.md), and all three local memory documents. Memory is noncanonical; original sources govern.

## Scope choices

- Single writer, documented rather than claiming cross-process safety. Use plain versioned rows, a branch column and semantic commit-parent DAG; no native branch feature dependency, branch-head subsystem, or append-event/projection architecture.
- Publish graph rows and their marker in the same batch. The durable marker contains semantic ID, parents, delta hash and actor, but never its own native transaction version. Discover that version after publication and define recovery of the external mapping ([scope fixes](../docs/OmniSpatialGraph_Concept_Test_Scope.md:15)).
- Disable optimization and cleanup; back up the table directory. This policy is not a retention proof ([scope reductions](../docs/OmniSpatialGraph_Concept_Test_Scope.md:24)).
- Define qualified-name + kind + disambiguator identity before G1; locations and content hashes remain evidence. Propose deterministic encoding, ambiguity handling and rename behavior without pretending rename continuity is solved.
- Retain universal extensible kinds, evidence/truth status and independent valid, observed and committed time. Optional geometry/reference frames must not impose spatial coordinates on code symbols. No 4D fixture now.
- Keep thin CLI → importable application API → contracts/core ports → concrete adapters. Only the storage adapter imports LanceDB; providers emit facts, not persistent graph identity ([dependency rules](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:95)).
- Preserve the installed harness, search tools, mode permissions and custom modes. Approach A is autonomous source reuse, not a host patch. Native integration and provider B remain deferred.

Deferred: production G1+, concurrent writers, Lance-native branches, retention/host-permission proof, large-history/repository proof, spatial 4D fixtures, JSON-LD/community retrieval, simulated native adapters and A→B migration proof. Later concept acceptance is tests 1, 2, 3, 4, 6, 7 and 9; test 7 uses branch-column branching ([scope success](../docs/OmniSpatialGraph_Concept_Test_Scope.md:43)). None has passed.

## Reserved future artifacts

The following links identify current deliverables. Original reserved Markdown experiment-evidence paths were not created; actual retained evidence is JSON and is linked below. Future G1 files are reserved only in the [contract handoff](../docs/g0/contracts-proposal.md).

| Area | Exact reserved artifacts |
| --- | --- |
| Upstream research | [upstream ledger](../docs/g0/upstream-ledger.md) |
| Contract reasoning | [contracts proposal](../docs/g0/contracts-proposal.md) |
| SDK environment | [isolated manifest](../experiments/g0/package.json), [npm lockfile](../experiments/g0/package-lock.json), [TypeScript configuration](../experiments/g0/tsconfig.json), [SDK smoke probe](../experiments/g0/sdk-probe.ts), [runtime evidence](../experiments/g0/runtime-evidence.json) |
| Batch experiment | [batch probe](../experiments/g0/batch-probe.ts), [independent evidence](../experiments/g0/independent-evidence.json:138) |
| Crash experiment | [crash controller](../experiments/g0/crash-probe.ts), [isolated writer](../experiments/g0/crash-writer.ts), [independent crash evidence](../experiments/g0/independent-evidence.json:94) |
| Final synthesis | [architecture feasibility report](../docs/g0/architecture-feasibility.md) |

Disposable databases/backups were confined to the isolated experiment and removed; evidence is retained and no task children remain ([cleanup](../experiments/g0/independent-evidence.json:15)). Avoid filenames matched by the existing broad test ignore. Current finalization permits only scoped Markdown dossier/tasks/root/wiki/changelog/local-context updates, no experiment evidence/source edits, root manifest, production packages, modes, harness, new ignores, commits or pushes.

## Responsibilities and sequencing

| Existing mode | Responsibility | Boundary |
| --- | --- | --- |
| Repo Explorer | T1 pinned upstream and SDK-source research | Read-only evidence gathering; hand off Markdown findings |
| Code | T2–T4 isolated environment and probes | Experiment files only; no production core or harness changes |
| Architect | T5–T6 contract/identity reasoning and G1 decomposition | Proposals only; no implementation |
| Documentation Specialist | Persist T1, T5–T6 findings; T7 final report | Own Markdown writes and link/source validation |
| Test Engineer | Conditional independent verification after T2–T4 implementation completes | Invoke only for a concrete need, such as ambiguous crash timing or disputed assertions; not routine planning |
| Code Reviewer | T8 final review | Final only, after all implementation, testing and artifact cleanup |
| Vulnerability Checker | T8 final security check | Final only; scoped to dependencies, process control and local persistence |

The parent coordinates existing modes according to native permissions; personas do not recursively dispatch other personas. Final-only reviews may be parent Orchestrator subtasks. Do not create new modes. Independent T1 research and T2 setup may run in parallel; T3 → T4 must be sequential and single-writer. Do not allow simultaneous edits to a shared report.

Dependency graph: T1 and T2 → checkpoint A; T2 → T3 → T4 → checkpoint B; T1/T3/T4 → T5 → T6 → checkpoint C; T1–T6 → T7 → T8 → checkpoint D → **human acceptance** → separately authorized G1 execution.

## Ordered tasks

### T1 — Pin upstream provenance and reuse rights

**Objective:** Establish whether each candidate scanner/cache/watcher/parser/embedding/store/worktree source file can be reused in a standalone provider. Research only; do not copy upstream implementation into this repository.

**Sources:** [v0.5 sections 6 and 13](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:231), [verification warning](../docs/OmniSpatialGraph_Concept_Test_Scope.md:9), [root security/provenance policy](../AGENTS.md:17).

**Dependencies:** None. **Estimated scope:** Small, one Markdown deliverable.

**Permitted files / exact deliverable:** Only the reserved upstream ledger. Repo Explorer supplies evidence; Documentation Specialist writes it.

**Required verification:** Resolve immutable upstream revision and per-file permalink/hash; inspect license headers, applicable license/notice files and dependencies at that revision. Separate current standalone package candidates from legacy research-only material. Include SDK release/native-binding research for T2 without claiming executed compatibility.

**Acceptance criteria:**
- Every candidate has revision, path, purpose, applicable license evidence, attribution obligations, host dependencies and a reuse/adapt/exclude/unverified disposition.
- No unverified licensing claim becomes permission to copy; legacy source is not relabeled MIT.
- Record inaccessible sources or unclear rights as blockers for affected reuse, not as passed verification.

### T2 — Establish isolated pinned SDK environment

**Objective:** Select and prove a real exact SDK release on the target Windows/Node environment without creating an application workspace.

**Sources:** [v0.5 SDK risk](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:229), [scope G0 check 1](../docs/OmniSpatialGraph_Concept_Test_Scope.md:36), [workflow command status](../docs/maintainer-wiki/workflows.md:3).

**Dependencies:** None; consume T1 SDK findings when available. **Estimated scope:** Medium, five files.

**Permitted files / exact deliverables:** Isolated manifest, npm lockfile, TypeScript configuration, SDK smoke probe and SDK evidence from the reservation table. No root dependency/configuration changes.

**Required tests:** Clean locked install; TypeScript check; native-binding load; create/open/close/reopen a disposable local table and read a known row. Verify the chosen release exposes the required batch/version APIs. Record exact Node, npm, OS/architecture, SDK and tooling versions, commands, exit status and observed output.

**Acceptance criteria:**
- SDK and tooling use exact pins and a reproducible lockfile, not floating versions.
- Target environment smoke operations and type check pass, or failures are explicitly blocking and reproducible.
- Evidence differentiates release documentation from runtime observations; experiment remains isolated.

### Checkpoint A — After T1–T2

Verify immutable source evidence, licensing dispositions, reproducible SDK setup and lack of harness/root changes. Unclear source rights block reuse, not independent SDK experiments. Failed SDK loading blocks T3–T4. No human reconfirmation needed to continue authorized G0.

### T3 — Measure one native version per batch

**Objective:** Demonstrate that one accepted marker-plus-row batch produces exactly one native table-version increment using the pinned batch API.

**Sources:** [scope G0 check 2](../docs/OmniSpatialGraph_Concept_Test_Scope.md:37), [marker correction](../docs/OmniSpatialGraph_Concept_Test_Scope.md:15), [v0.5 one-table commit](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:215).

**Dependencies:** T2. **Estimated scope:** Small, two files.

**Permitted files / exact deliverables:** Reserved batch probe and batch evidence; disposable experiment data only.

**Required tests:** Capture initial table version after setup; execute one mixed insert/update batch with marker and distinguishable rows; capture versions afterwards and reopen to read exact persisted content. Repeat with a second nonempty batch to exclude table-creation noise. Disable optimization/cleanup. Assert one increment per executed batch, marker contents and post-publication version lookup. Record row counts, keys and delta hash inputs.

**Acceptance criteria:**
- Each measured nonempty batch increments the table version by exactly one, with all expected rows and marker readable after reopen.
- Marker never stores its own native version; external mapping derives from observed table versions.
- Unexpected increments or content mismatches fail feasibility rather than prompting an undocumented multi-transaction workaround.

### T4 — Force-terminate one writer during publication

**Objective:** Test all-or-none visibility of one batch and its marker after abrupt process death and restart.

**Sources:** [scope G0 check 3](../docs/OmniSpatialGraph_Concept_Test_Scope.md:38), [v0.5 native-commit test](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:297), [single-writer reduction](../docs/OmniSpatialGraph_Concept_Test_Scope.md:24).

**Dependencies:** T2–T3. **Estimated scope:** Medium, three files.

**Permitted files / exact deliverables:** Reserved crash controller, isolated writer and crash evidence; disposable experiment data/backup only.

**Required tests:** Controller starts one child writer on a fresh local dataset, records PID and readiness/in-flight signals, terminates only that child with a Windows-compatible forceful mechanism, waits for exit, then reopens storage in a separate process. Use a large enough batch to expose an in-flight interval; capture timing and acknowledged SDK-call state. Assert either zero new batch rows and no marker, or every expected new batch row with exactly one marker, matching content/hash and no partial subset. Include a successful non-killed control and recovery of the native-version mapping. Back up the closed baseline table before destructive testing.

**Acceptance criteria:**
- Marker exists if and only if all expected rows exist; partial rows without marker also fail, even if the simple equivalence would otherwise be vacuously true.
- Evidence shows abrupt termination while publication was outstanding. If the writer finished before termination or timing is unobservable, mark the attempt inconclusive and retry or block; do not call it a crash pass.
- Preserve commands/timings/content assertions and restart result; no unrelated process termination, concurrent-writer or retention claim.

### Checkpoint B — After T3–T4

Require SDK pin, one-version batch evidence and a valid crash/restart result. Label failed/inconclusive checks separately. If concrete timing/assertion ambiguity remains after implementation, parent may request independent Test Engineer verification before final synthesis. Failure blocks G0 feasibility recommendation, not documentation of findings.

### T5 — Propose universal contracts and identity

**Objective:** Write a reviewable v1 schema/API/provider boundary proposal grounded in experiment results, not production interfaces.

**Sources:** [v0.5 section 3](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:104), [CLI envelope/errors](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:203), [universality](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:269), [scope fixes/reductions](../docs/OmniSpatialGraph_Concept_Test_Scope.md:15).

**Dependencies:** T1, T3, T4 evidence, including failures. **Estimated scope:** Small, one Markdown deliverable.

**Permitted files / exact deliverable:** Only reserved contracts proposal; Architect reasons, Documentation Specialist persists.

**Required verification:** Requirements-to-contract table; worked valid/invalid examples for entities, edges, evidence/truth status, temporal fields, ingestion changes/facts/deltas, semantic marker and API result/error envelope. Specify JSON Schema/TypeScript parity obligations for future executable tests. Desk-check identity with line insertion, overload/same-name collision, ambiguous rename and non-code qualified names. No claim of compiled or executable schemas.

**Acceptance criteria:**
- Define deterministic qualified-name + kind + disambiguator encoding, workspace/namespace collision policy and ambiguity behavior before G1; line/chunk hashes are not persistent identity.
- Specify plain-row branch isolation, parent DAG, compatible merge versus same-key rejection, marker/version lookup and rebuildable index revision provenance; distinguish durable marker from API commit result.
- Universal optional geometry and truth/time fields coexist with provider-neutral facts and narrow persistence ports; API exposes no SDK handles; caller flags are not authorization.

### T6 — Define the gated G1 handoff

**Objective:** Add a bounded G1 plan to the contracts proposal without authorizing or implementing it.

**Sources:** [v0.5 G1](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:281), [dependency direction](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:95), [acceptance tests](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:292), [human gate](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:312).

**Dependencies:** T5. **Estimated scope:** Small, one existing proposal file.

**Permitted files / exact deliverable:** Only reserved contracts proposal, adding a dedicated G1 handoff section with small/medium slices and acceptance tests.

**Required verification:** Map proposed slices to schema/type parity → identity/evidence/time → persistence adapter/atomic commit mapping → shared application API → thin CLI init/status. For each slice specify dependencies, exact future file allowlist, focused tests, deliverables and acceptance; include checkpoints every two or three slices. Defer provider A implementation to G2 and history/branch merge implementation to G3.

**Acceptance criteria:**
- G1 entry requires all three G0 checks, written identity rule, resolved applicable reuse rights and recorded explicit human acceptance of final G0 findings.
- G1 tests cover standalone direct library and CLI init/status, schema parity, identity continuity/collisions, marker atomicity/recovery and error-envelope/stream separation without host installation.
- Proposed files/commands remain labeled future; no production code, native integration or provider-migration test is included in authorized G0 execution.

### Checkpoint C — After T5–T6

Desk-check source coverage, contract consistency and complete G1 slice metadata. Unresolved identity/SDK issues stay visible as G1 blockers. No schema proposal is described as a shipped or frozen implementation.

### T7 — Publish the G0 decision dossier

**Objective:** Produce the final architecture feasibility report for human acceptance, with measured facts distinct from proposals.

**Sources:** [v0.5 G0 deliverable](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:280), [specification evidence warning](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:325), [concept limits](../docs/OmniSpatialGraph_Concept_Test_Scope.md:53), [documentation workflow](../docs/maintainer-wiki/workflows.md:9).

**Dependencies:** T1–T6; any needed independent testing complete. **Estimated scope:** Small, one Markdown deliverable.

**Permitted files / exact deliverable:** Only reserved architecture feasibility report.

**Required verification:** Link pinned upstream ledger, contract/G1 proposal and all three experiment evidence records. Include a pass/fail/inconclusive matrix, exact reproducibility instructions, observed versus proposed conclusions, unresolved rights/identity limitations, and explicitly deferred proofs. Outline later performance measurements without claiming G0 benchmarks. Validate local references and source-line ranges.

**Acceptance criteria:**
- Recommendation is proceed-to-human-review or blocked with reasons, never automatic permission to start G1.
- Every runtime conclusion points to recorded environment, command, output and assertions; every rights claim points to pinned evidence.
- Report states that concept checks do not prove concurrency, retention, scale, 4D or provider swaps, and records human acceptance as pending.

### T8 — Final scoped quality and security disposition

**Complete — 2026-10-13:** supplied final verdicts and nonblocking follow-ups are [recorded](../docs/g0/architecture-feasibility.md:62). No new runtime/audit execution or implementation; review had no fresh runtime/Git diff and only partial historical evidence reading. Ready for human review, not human acceptance.

**Objective:** Complete final-only review after all agreed G0 implementation/testing and disposable artifact cleanup; do not start G1.

**Sources:** [root preservation/security policy](../AGENTS.md:17), [workflow Git preservation](../docs/maintainer-wiki/workflows.md:17), [host boundary](../docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:211).

**Dependencies:** T7 and all implementation/testing complete. **Estimated scope:** Small, one report update.

**Permitted files / exact deliverable:** Only reserved feasibility report, with Code Reviewer and Vulnerability Checker verdicts persisted by Documentation Specialist. Review covers all G0 files but grants no new write scope.

**Required verification:** Code Reviewer checks experiment assertions, contract/source consistency and scope preservation. Vulnerability Checker checks pinned dependency findings, process-target isolation, workspace-contained persistence, secret exclusion and provenance. Run neither during this planning task. If remediation needs implementation, return to its owning task and rerun affected verification before repeating final review.

**Acceptance criteria:**
- Both final verdicts and blocking/nonblocking findings are recorded against the final evidence state.
- Started processes are stopped, disposable datasets are cleaned and reproducibility evidence remains; pre-existing files/staging and harness are untouched.
- No unresolved blocking feasibility/security issue is hidden; explicit human acceptance is still pending before G1.

### Checkpoint D — After T7–T8

Final G0 dossier and reviews complete; all three experiment outcomes traceable. **Stop at the G0→G1 boundary.** A human may accept or reject the dossier later; this plan does not solicit confirmation or record acceptance on their behalf.

## Command status and evidence discipline

There is no root manifest, runnable build/lint/test/type-check command, or checked-in documentation validator ([current workflow](../docs/maintainer-wiki/workflows.md:5)). Do not present specification CLI examples as runnable.

For the isolated experiment, npm scripts now exist: [`npm --prefix experiments/g0 run install:locked`](../experiments/g0/package.json:11) and [`npm --prefix experiments/g0 run verify`](../experiments/g0/package.json:17). Earlier Code execution records both exit 0; independent six subcommands exit 0 but its outer deadline wrapper stalled and outer exit was not captured. No root application CLI exists. Windows termination targets only the child PID, never all Node processes. No Unix command is prescribed for Windows.

Evidence records must include date, source/SDK pins, environment, dataset parameters, exact invocations, exit status, expected/actual assertions and failure details. Never store credentials, secret files or private workspace data. Reproducibility is not a claim that deferred production tests passed.

## Risks and blockers

| Risk / limitation | Impact | Handling |
| --- | --- | --- |
| SDK 0.40.0/native load verified on measured Windows target only | Other targets remain unproven | Preserve exact pins and target limitations |
| Upstream rights or standalone host independence unclear | Could block source reuse | T1 file-level evidence and exclusion; no copying now |
| One native-write interruption demonstrated; two earlier misses inconclusive | No power-loss/all-placement guarantee | Preserve timing failures and independent wrapper failure |
| Identity disambiguation/rename semantics unresolved | Blocks G1 identity acceptance | T5 explicit rule/examples and ambiguity policy |
| Broad test ignore and local-only wiki | Could hide artifacts or impair clone portability | Use nonignored experiment filenames, inspect Git visibility; record limits without changing policy |
| Filesystem MCP unavailable in this host | Requested file-operation transport cannot be honored | Host file tools used transparently; do not claim MCP execution |
| Final dispositions complete; explicit human G0 acceptance pending | Blocks G1 implementation | Three scoped checks passed; ready for human review, not full concept or human acceptance |

## Planning validation scope

Finalization validates scoped Markdown local links/source-line ranges and wiki catalog completeness under [workflows](../docs/maintainer-wiki/workflows.md:9), plus plan/checklist/dossier consistency. Correct actual evidence paths; future G1 paths remain explicitly reserved. Update durable wiki/changelog and all local context except brief. Existing navigation graph is not regenerated in this scope; queue its refresh and retain noncanonical status. Inspect Git visibility; no commits or pushes.

The [checklist](todo.md) distinguishes completed G0 evidence/documentation/final dispositions from pending explicit human acceptance. G1 remains unstarted; canonical JSON, rename continuity, relation identity/key and migration decisions remain unresolved. Applicable grammar/native/dependency rights require approval before affected copying, not a blanket G1 blocker when source remains uncopied.
