# Plan: Bounded reconciliation of uncommitted changes

## Scope and evidence

Bounded work for “analyze the changes in the codebase and update what's needed”: current uncommitted work on branch **vector**, compared with HEAD **86141bccd74bf034edb82669e5bf8158d6727717**. Tasks 1–3 and parent OSG persistence are complete on the attributed evidence below. Final Code Reviewer/security assessments pending in parent workflow, outside the implementation checklist.

Parent-supplied baseline: 14 changed paths, initially including three intent-to-add entries; now 11 modified and three untracked, with contents unchanged and no staging commands. Preserve the index and unrelated changes. Before implementation, recheck branch, revision, status (including untracked paths) and scoped diff; stop on conflicting drift rather than overwriting work.

Parent reports a fresh code subtask passed typecheck, build and the full suite: **99 pass / 0 fail / 0 skip**. This is attributed baseline evidence, not execution by this planning task or proof of later edits, security, distribution readiness or gate approval.

Documentation-task recheck confirmed the requested branch/HEAD and preserved the existing work. Task 1 completion is parent-supplied and source-inspected: obsolete provider runtime TypeScript and its exact lock dependency entry removed, root development tooling retained, and package metadata regression added. Parent reports later focused package/provider **4 pass** and green typecheck/build. Task 2 used actual source and read-only OSG context/history. Fresh parent-supplied Test Engineer evidence now completes task 3: npm.cmd run typecheck/build/test each exited **0**, full **100 pass/0 fail/0 cancelled/0 skip/0 todo**, runner **423.074 seconds**. The initial full-test wrapper stopped at **300 seconds** without a final result; one bounded **600-second** retry passed. git diff --check exited **0** with LF/CRLF warnings only; **66 tracked/untracked baseline hashes**, index and frozen specification hash were unchanged; task-owned temporary artifacts/processes were cleaned. Earlier documentation checks covered **135 local links/20 anchors/84 citation line bounds**, all clean. Synthetic vectors only, not real-model inference or semantic benefit. This final documentation update runs no application tests, OSG or legacy-memory writes.

## Ordered work

**Post-review correction:** the required [public-warning budget fix](../packages/cli/src/index.ts:645) and [regression](../tests/embeddings.test.mjs:127) moved RED **415 estimated tokens/389 budget** → GREEN. Parent-supplied recovery, separate **180-second-capped** commands: typecheck/build **0**, package **2** + provider **2** + embedding **7** = **11 pass/0 fail/0 skip**; earlier context-focused passes are not added. The full **100-pass** evidence above and task 3 below predates this fix, not final-code proof. Latest independent **900-second** full wrapper interrupted before exit/counts recovered: inconclusive, no 101-pass claim. [Current handoff](../docs/public-prototype.md#evidence) records follow-up persistence, skipped declarations and cleanup limits. Only final static parent assessments remain; optional suggestions deferred, no approval.

1. **Complete — supplied implementation evidence, diff inspected.** Remove only the obsolete provider runtime TypeScript dependency from [provider metadata](../packages/indexing-kilo/package.json) and minimally reconcile the [lockfile](../package-lock.json). Preserve root development TypeScript in the [root manifest](../package.json). Accept when the provider runtime declaration is absent, root development tooling remains and no unrelated pins change. Verify the scoped manifest/lock diff. **Dependencies:** baseline drift check. **Scope:** two metadata files; supplied implementation also added the [package regression](../tests/package.test.mjs:7).
2. **Complete — documentation/source reconciliation and affected-link checks.** Reconcile affected documentation only against actual source: optional, default-disabled embeddings; one persistent Swift child per scan; doctor handling of old-head caches; broken references to the old wiki. Follow the current documentation roles in [operations](../docs/operations.md). Accept when affected claims and replacement links match current evidence without reviving a wiki or task diary. Verify source citations and local targets/anchors; bound each editing slice to at most five affected documents. **Dependencies:** task 1 and direct source verification. **Scope:** affected documentation only; no speculative rewrites.
3. **Complete — parent-supplied final Test Engineer validation and persistence.** Typecheck/build/full suite and preservation evidence are recorded above; affected links/anchors were checked. Frozen [specification](../docs/OSG_MVP_SPEC.md) SHA-256 remains **7c9dcc2f29ca48d7925e2df10dbf4d1dfa0c7426fbb55fa0035505696985a908**. Parent persistence subtask reports sync exit **0**, commit **c0a5c15678d076d5a402cf6c44549db0f03c2bcd21f2f3a8de5d2c8b90b6c764c**; remember exit **0**, episode **agent:episode:751bbb3950c2dbf6963a2dc8**, commit **c34243e76e0c8fb034fa0be2ab4d6d8b509e2a63ddbe0b145b9d7bbdad04fc9e1**. Workspace identity/format 2 preserved; all six entities resolved. Sync skipped **781 AMBIGUOUS_DECLARATION** warnings; remember reported **POLICY_REFS_UNAVAILABLE** (loaded-rule hashes unavailable). No exhaustive indexing or approval claim. Supported verification/health reads succeeded; the initial unsupported status operation exited **9**, not a format error. Source/index/specification unchanged per supplied evidence. **Dependencies:** tasks 1–2. **Scope:** attributed validation/persistence evidence; no persistence by this documentation subtask.

## Task 4 — Static external review handoff

**Status: final Code Reviewer/security assessments pending in parent workflow.** This handoff is outside the completed implementation checklist; it does not claim review completion or approval.

- Parent supplies the completed scoped diff, baseline, final validation, dependency/documentation changes and persistence limits to the final Code Reviewer and security assessments.
- Parent delivers actual verdicts, findings and assessment limits in the parent's final response. Ordinary nonblocking verdicts require no further task-artifact edits.
- Any concrete blocker requires a bounded correction and revalidation before final assessments. No successful outcome is predicted; reviews are not human approval or clean-security certification.

**Dependencies:** completed tasks 1–3 and parent persistence. **Scope:** external handoff only, not an unfinished implementation task or an assessment performed by documentation.

## Checkpoints and boundaries

- After tasks 1–2: inspect the scoped diff for dependency drift, unsupported documentation claims and unrelated edits before final validation.
- After task 3: retain fresh evidence separately from historical/parent-supplied evidence; then request final assessments.
- No new features, model downloads, dependency upgrades, specification edits, packaging, approvals, commits or pushes. No legacy memory/wiki/graph operations or harness maintenance. OSG is sole operational memory; parent handles persistence.
- These files are finite task artifacts, not an operational diary or a revived legacy bank. Existing plan targets were checked and both were absent; no incomplete plan was overwritten.

Execution checklist: [task list](todo.md).
