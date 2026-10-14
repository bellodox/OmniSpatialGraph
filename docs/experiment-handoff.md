# Runnable experiment handoff

2026-10-14 · Documentation Specialist · Experimental engineering handoff, **not formal gate acceptance**.

See the [actual cross-agent memory demonstration](agent-memory-demo.md) for the captured A → B → fresh C greeting task, observed IDs/results and scheduled parent cleanup.

Current human authorization covers the standalone experiment and these documentation updates. The entire [authoritative specification](OSG_MVP_SPEC.md), including §22, remains frozen. G0–G6 acceptance and Q1–Q9 remain human-only. Agreed implementation/testing/simplification/documentation and final reviews are complete. Outstanding High dependency risk means **no clean-security verdict or distribution clearance**.


Human-supplied final Code Reviewer targeted mandatory-fix verdict: **APPROVE WITH SUGGESTIONS**, no concrete blocker; non-Windows case-insensitive filesystems remain a limitation. Final Vulnerability Checker: **NO BLOCKING FINDINGS** within the targeted **Windows private-experiment scope**; mandatory-case application BLOCK resolved, original hard-link/protected-state clearance carried forward. These verdicts do not establish clean security, distribution clearance or formal gate acceptance. No further agent review or implementation cycle is pending in the agreed scope.

Windows mandatory exclusions case-fold BEFORE traversal, nested ignore-file reads and content reads; attempted negations fail. The [synthetic fixture](../tests/security.test.mjs:218) covers mixed-case runtime, task, harness, Git, analysis and build/dependency directories: .OSG, docs/Tasks, .SpeXcode, .Git, .Understand-Anything, the legacy harness variant, Node_Modules, Dist and Build. It also covers sensitive filename variants, environment-file variants and declaration extensions. Original paths, logical IDs, hash case semantics and collision detection are unchanged. Fresh stores contain no excluded facts/rows/history/context; repeat sync adds no rows. ([provider](../packages/indexing-kilo/src/index.ts:44), [fresh-store proof](../tests/security.test.mjs:214)).

**Affected-store privacy warning:** standard sync retracts previously leaked facts from current state/context only. Every original non-head row is preserved; append-only history and old-commit views remain accessible. Use a **fresh disposable workspace/store** for privacy, not a purge or historical-cleanup claim. ([affected-store proof](../tests/security.test.mjs:284)).

Confirmed Low raw diagnostic local-path disclosure remains: redact shared logs; future sanitization is not implemented. Image/embedding features remain disabled; no reachable application image-decoding path was established. The previous fresh dependency audit still has 3 High entries via sharp; human owner-reviewed disposition is required before enablement/distribution and by 2026-10-21. Linux/macOS/non-Windows case-insensitive filesystems/crash/power-loss/TOCTOU/network-filesystem/large-store/independent clean install/native-LGPL closure remain unverified.

## Install and validation from the project root

Windows CMD examples follow the actual [scripts](../package.json:7) and [output layout](../tsconfig.json:9). Node 22/24 LTS is supported by the manifest; the reported tested platform is Windows x64, Node 24.14.1. Use the lockfile and retain optional native dependencies; do not use an omit-optional install.

```bat
npm.cmd ci --include=optional
npm.cmd run build
npm.cmd run typecheck
npm.cmd test
node --test tests/independent.test.mjs
node --test tests/security.test.mjs tests/provider.test.mjs
node dist/cli/src/index.js help --json
```

The focused test requires the preceding build. Its [source](../tests/independent.test.mjs:17) imports compiled modules. There is no lint or configured documentation-check script. These are reproducible examples, not a transcript newly executed by this documentation task.

Pins: LanceDB 0.40.0, Arrow 18.1.0, TypeScript 5.9.3, noble hashes 2.0.1, Node types 24.10.0 ([manifest](../package.json:12), [lockfile](../package-lock.json)). Optional Windows x64 and Linux x64 native packages are retained; Linux runtime execution is not proved.

## CLI smoke workflow

Choose an existing disposable workspace containing source files. Set its absolute path below; the commands themselves run from the project root. Do not target the host index. Initialization creates runtime data and may add five runtime exclusions through atomic sibling replacement of that workspace's ignore file ([implementation](../packages/cli/src/index.ts:154)). It is therefore not a read-only command and should not be run on this repository merely to validate documentation.

```bat
set "OSG_WORKSPACE=C:\path\to\disposable-workspace"
node dist/cli/src/index.js init --workspace "%OSG_WORKSPACE%" --json
node dist/cli/src/index.js sync --workspace "%OSG_WORKSPACE%" --json
node dist/cli/src/index.js sync --workspace "%OSG_WORKSPACE%" --json
node dist/cli/src/index.js context --workspace "%OSG_WORKSPACE%" --task "greet" --max-tokens 800 --json
```

For a workspace containing a uniquely named greet function in a root-level source file named greet.ts, the [tested identity](../tests/independent.test.mjs:89) supports these agent start/before-edit/end examples:

```bat
node dist/cli/src/index.js context --workspace "%OSG_WORKSPACE%" --task "greet" --max-tokens 800 --json
node dist/cli/src/index.js history --workspace "%OSG_WORKSPACE%" --entity "code:symbol:greet.ts#greet" --json
node dist/cli/src/index.js remember --workspace "%OSG_WORKSPACE%" --task "greet" --decision "Preserve the greeting API" --outcome "Checked the source" --entities "code:symbol:greet.ts#greet" --json
node dist/cli/src/index.js verify --workspace "%OSG_WORKSPACE%" --json
node dist/cli/src/index.js export episodes --workspace "%OSG_WORKSPACE%" --json
```

Substitute an actual returned entity ID for other workspaces. Remember accepts comma-separated IDs or uniquely resolved names; unresolved references produce warnings rather than invented links. Episode text is untrusted hypothesis, not policy or approval. Rule hashes are unavailable and explicitly warned about ([memory implementation](../packages/core/src/memory.ts:37)). Context budgets use a deterministic character-count divided by four estimate for the entire JSON envelope, not a model tokenizer ([packing](../packages/cli/src/index.ts:251)).

## Recovery and failure handling

- A stale citation is a pure read result: inspect current source, run sync, then repeat context. Do not treat stored text as instructions.
- Exit 3 means exhausted stale-head retries. Run sync and retry the original operation once; report persistent conflict. Sync and remember already have bounded retries ([sync](../packages/core/src/memory.ts:9), [remember](../packages/core/src/memory.ts:37)).
- If remember reports that its commit succeeded but export failed (exit 6), retain the returned commit ID, repair the export-path problem, then run export episodes. Do **not** blindly remember again: that creates another episode. Export rebuilds from authoritative graph rows, not from the old export ([recovery test](../tests/integration.test.mjs:141)).
- History and verify accept full commit IDs or unique prefixes of at least 12 characters including the leading c; short/ambiguous selectors fail with exit 5, missing commits with exit 7 ([selector tests](../tests/independent.test.mjs:306)). Supply a real returned ID, not the captured developer IDs below unless querying that same store.
- Missing runtime config returns NOT_INITIALIZED, exit 6; unrelated config I/O failures are not misclassified as missing config ([regression](../tests/integration.test.mjs:42)). The adapter is [lazy-loaded](../packages/cli/src/index.ts:221): help does not require native storage, while adapter-load failure returns one JSON STORAGE_UNAVAILABLE envelope, exit 6. The [missing-native test](../tests/integration.test.mjs:59) injects an isolated module-resolution failure; it does not delete an installed binary.
- Exhausted ignore-file replacement retries for EPERM/EACCES/EBUSY return STORAGE_UNAVAILABLE, exit 6, with a path-free message explaining storage may already be initialized: release locks/sharing restrictions and rerun init. Existing ignore bytes and workspace identity are preserved; unrelated I/O handling is unchanged (injected EIO remains INTERNAL, exit 1). [Regression coverage](../tests/security.test.mjs:332) injects failures, not real OS locks; [bounded handling](../packages/cli/src/index.ts:177) does not claim OS-lock proof.
- Initialization creates ROOT in the table's initial data and publishes a complete private staging table without replacing a concurrent winner ([storage publication](../packages/storage-lance/src/index.ts:34)); config publication preserves the winning workspace identity ([config publication](../packages/cli/src/index.ts:129)). A legacy headless table fails with NOT_INITIALIZED without mutation: preserve it for recovery, rather than expecting init to repair it ([modeled failure](../tests/graph.test.mjs:47)).

```bat
node dist/cli/src/index.js sync --workspace "%OSG_WORKSPACE%" --json
node dist/cli/src/index.js context --workspace "%OSG_WORKSPACE%" --task "greet" --max-tokens 800 --json
node dist/cli/src/index.js export episodes --workspace "%OSG_WORKSPACE%" --json
node dist/cli/src/index.js verify --workspace "%OSG_WORKSPACE%" --json
```

The [CLI contract actually implemented](../packages/cli/src/index.ts:19) always emits one JSON envelope to stdout; errors also emit a diagnostic to stderr. Exit meanings: 0 success, 1 internal error, 2 usage, 3 stale head, 4 state conflict, 5 invalid schema/delta, 6 storage/not initialized, 7 missing branch/commit, 8 verification failed, 9 unsupported. This mapping is not a claim every category has independent process coverage. Approval, watch, query, scan, status, branch, graph, diff, propose, commit, doctor, maintain, vectors and server commands are unsupported ([help](../packages/cli/src/index.ts:216)).

## Importable core

Build output exposes [memory functions](../packages/core/src/memory.ts:9) at dist/core/src/memory.js, [graph functions](../packages/core/src/graph.ts:143) at dist/core/src/graph.js and [hash functions](../packages/core/src/hash.ts:7) at dist/core/src/hash.js. There is no core index/barrel export or package-level exports map ([package](../packages/core/package.json:1)). The storage adapter is separate. A read-only export-discovery example from the root is:

```bat
node --input-type=module -e "import('./dist/core/src/memory.js').then(m => console.log(Object.keys(m)))"
```

## Reported proof record and provenance

The following results were supplied by the current parent/human handoff from captured developer, independent testing, simplifier, post-review-fix, security-remediation and final-checker runs. Documentation **did not rerun** install/build/tests/audits or reconstruct transcripts. The prior verified 35-test build/typecheck/full-suite result was not rerun by the final checker. Earlier targeted mandatory-exclusion/reconciliation 2-pass, full-suite 33/focused 7-pass, full-suite 31/focused-security 3-pass, 28-test and 20-test evidence remains historical, including the [maintainer log](maintainer-wiki/log.md).

Final checker reported this focused command, exit 0, **5 pass/0 fail/0 skip**:

```bat
node --test --test-name-pattern="mandatory|platform-aware|nested ignore privacy|sharing failures" tests/security.test.mjs
```

Its in-memory compiler comparison matched **seven existing outputs**, with **zero temporary files** and **status unchanged**. This is supplied final-checker evidence, not a fresh full build or independent clean install.

| Reported result | Reproducible source evidence |
| --- | --- |
| Latest mandatory mixed-case fix: Windows x64 Node 24.14.1; build, typecheck, full test each exit 0; 35 pass, 0 fail, 0 skip; targeted mandatory-exclusion/reconciliation tests 2 pass | [Scripts](../package.json:7), [fresh-store test](../tests/security.test.mjs:214), [affected-store test](../tests/security.test.mjs:284) |
| 22 literal canonical input/byte/hash triples, independently fixed | [Golden triples](../tests/independent.test.mjs:54); distinct from the additional encoder-based [contract fixtures](../tests/contract.test.mjs:22) |
| Nested empty/all-null object-member omission retained, with explicit byte/hash goldens; array positions preserved | [Goldens](../tests/contract.test.mjs:11), [§9.1](OSG_MVP_SPEC.md:465), [Appendix A reference](OSG_MVP_SPEC.md:948); not a canonical-format change |
| Null valid-from supersession/retraction closes prior rows at negative infinity, distinct from an absent end | [Snapshot semantics](../packages/core/src/graph.ts:75), [current/valid-time/history regression](../tests/graph.test.mjs:10) |
| ROOT present in the first table version; concurrent initializers share one identity; additional reported stress: 20 rounds with four initializers each preserved committed data | [Initial-version/preservation assertions](../tests/graph.test.mjs:32), [CLI concurrency assertions](../tests/integration.test.mjs:16); additional stress is a supplied result, not a 20-round loop in these suites |
| Ten two-process CAS rounds, 20 writers, one exit 0 and one exit 3 each; long-lived reader sees winners and loser commits are unreachable | [Process races](../tests/independent.test.mjs:211), [immutability checks](../tests/graph.test.mjs:68) |
| Separate init/sync/remember/context processes retrieve relevant episode and source within the whole-envelope 800-token estimate; inserted lines move citation 1→11 without changing symbol ID | [Lifecycle assertions](../tests/independent.test.mjs:85) |
| Unsynced stale reads preserve bytes/mtime; deletion removes current facts while retaining three historical versions; repeated sync leaves head and disk unchanged | [Disk snapshots](../tests/independent.test.mjs:42), [lifecycle checks](../tests/independent.test.mjs:113) |
| Verify and replayed exports use graph authority; forged export ignored; post-commit export failure recoverable | [Forged export checks](../tests/independent.test.mjs:126), [failure/replay checks](../tests/integration.test.mjs:141) |
| Runtime junction rejection leaves outside sentinel unchanged | [Confinement checks](../tests/independent.test.mjs:184) |
| Four reproduced defects repaired without removing assertions: duplicate import edges, malformed stored JSON classification, commit-prefix resolution, malformed config classification | [Import regression](../tests/independent.test.mjs:292), [stored JSON regression](../tests/independent.test.mjs:277), [prefix regression](../tests/independent.test.mjs:306), [config regression](../tests/independent.test.mjs:266) |
| Post-review regressions retain missing-config/native-load/headless-init classification and reject guessed unknown-extension or Markdown import targets | [Config/native injection](../tests/integration.test.mjs:42), [headless fixture](../tests/graph.test.mjs:47), [import resolution](../tests/provider.test.mjs:8) |

Captured developer initial-sync commit: c78dfcf9f018668b464bc1a59b89ecc3d65395ff53cab04a9f55cbf5cb6620b38; repeated sync was a no-op at that same commit. Captured episode commit: c7ca5902d0de499b1fd6aab672130c7ca5704f22f54289d45ddb1b7d6e58f9e8f. These are reported values, not newly generated documentation outputs or reusable IDs in another store.

One LanceDB access-denied version-hint warning occurred in the passing CAS race simplifier run. Retain that observation for final review; passing exits do not erase native-storage diagnostics. Test-owned temporary fixtures/processes were reported cleaned; test sources and assertions remain intact.

The earlier documentation-only checks passed local links/line bounds and wiki catalog coverage, matched the complete specification SHA-256 baseline, and preserved source/test/toolchain hashes. The [dated validation record](maintainer-wiki/log.md) distinguishes those historical checks and this refresh from reported application runs.

## Security remediation and dependency disposition

Supplied remediation evidence, not audits newly run by documentation:

- [Static hard-link regressions](../tests/security.test.mjs:29) refuse linked ignore/config/export/store files and preserve outside sentinel bytes and mtime. Ordinary ignore rules are retained with [atomic sibling replacement](../packages/cli/src/index.ts:154), not in-place truncation. This is not hostile concurrent-TOCTOU proof.
- [Nested privacy regressions](../tests/security.test.mjs:85) assert ignored files are not read and produce no graph facts, history or context in the tested fresh store; runtime/task-plan exclusions cannot be negated. Hierarchical matching uses exactly pinned ignore 7.0.12 ([provider manifest](../packages/indexing-kilo/package.json)).
- [Mixed-case privacy regression](../tests/security.test.mjs:156) covers Windows case-insensitive nested ignore matching before reads, including pruned ancestors. [Provider matching](../packages/indexing-kilo/src/index.ts:38) is case-sensitive on other platforms, but that branch is untested; logical identity and hash case semantics are unchanged.
- [Protected-state regressions](../tests/security.test.mjs:383) reject public replacement/retraction of approved/policy rows independently of caller actor label, before publication. Fixture authority is preloaded through low-level storage, not an agent approval path.
- Three additional genuine concurrency rounds passed, each with four fresh and four repeated initializers; these supplement historical 20-round stress. Extra rounds are supplied evidence, not a loop in the committed suite.
- Reported lock comparison: 139 external entries, 0 metadata gaps, 113 restored; 0 existing-version or optional-flag drift. LanceDB 0.40.0, Arrow 18.1.0 and all seven native packages preserved ([lockfile](../package-lock.json)). No arbitrary pin upgrades authorized.
- Reported npm signature audit exit 0: 114 signatures and 10 attestations. This does not establish vulnerability absence or license closure.
- Fresh npm vulnerability audit exit 1: **3 High package entries**, along LanceDB → Transformers → sharp 0.33.5, with advisories [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) and [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). Package entries are not a claim of three reachable application exploits.

The previous checker found no reachable application image-decoding path; image/embedding features remain disabled. This bounds exposure in the **private experimental scope**, not distribution clearance or a clean-security verdict. Owner-reviewed dependency disposition is still needed **before enabling image/embedding features or distribution, and by 2026-10-21**; agents cannot approve that human decision. Native/LGPL license closure is unverified; a clean install was not independently run. Final targeted checker resolved the mandatory-case application BLOCK and carried forward original hard-link/protected-state clearance; the dependency risk remains outstanding.

The exhausted-sharing-retry message is path-free; confirmed Low raw local-path disclosure in other diagnostics requires redaction before sharing transcripts. Future sanitization is not implemented. Existing version-hint warnings and platform/durability gaps below remain relevant; final scoped reviews are complete, not blanket security clearance.

## Limitations and next handoff

The [independently written TypeScript compiler API provider](../packages/indexing-kilo/src/index.ts:108) is **not Tree-sitter or Approach A**, despite its historical package-slot name. It extracts files, named declarations, Markdown headings, containment and local imports; no call edges. [Import resolution](../packages/indexing-kilo/src/index.ts:63) considers only supported code extensions, never guessed unknown extensions or Markdown targets. Discovery now uses [nested hierarchical ignore matching](../packages/indexing-kilo/src/index.ts:26) with mandatory exclusions; tests do not establish every Git behavior. Sync rescans sources; graph no-op is proved, but unchanged-file parse skipping, explicit rename chains and backup-copy recovery are not established by this evidence.

Retrieval is lexical with bounded traversal, without embeddings/vectors. No verified loaded-rule manifest, automatic approval, host integration or formal acceptance exists. WSL Ubuntu 24.04 is reported present but Node missing, so Linux was not run. Linux/macOS and non-Windows case-insensitive filesystems remain unverified. No forced-crash/power-loss, TOCTOU or measured large-store evidence is available; the planned forced-kill checklist must remain incomplete. Init failure coverage models a legacy headless table, not a kill/power-loss event. Staging cleanup runs on normal unwinding, not after abrupt termination; publication relies on local-filesystem directory-rename and config hard-link behavior, not proved power-loss/fsync durability or portable network-filesystem semantics. Agreed experiment work and final reviews are complete; human dependency-risk disposition remains outstanding, and broader evidence gaps require separately authorized work. See the [checklist](tasks/todo.md) and [open work](maintainer-wiki/open-work.md).
