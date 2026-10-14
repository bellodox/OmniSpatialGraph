# Maintainer Log

## 2026-10-14 — Post-review-fix handoff refresh

- Inspected actual modified graph/hash/CLI/storage/provider source and regression assertions. Current human report: Windows x64 Node 24.14.1 build/typecheck/full tests each exit 0, 28 pass/0 fail/0 skip; additional init stress of 20 rounds/four initializers preserved committed data. This supersedes the earlier 20-pass results below without erasing their historical provenance. Documentation did not rerun application checks.
- [Handoff](../experiment-handoff.md) records null-time closing, missing config/lazy native-load classification, initial-data ROOT/private staging and nonmutating headless failure, supported-code import targets and unchanged canonical omission with explicit goldens. Missing-native coverage injects module resolution; headless coverage models failure, not kill/power-loss. Local rename/hard-link reliance and abrupt-crash staging cleanup remain limitations.
- Earlier Code Reviewer approved with suggestions without edits; suggestions fixed, but reviewer rerun and final vulnerability/dependency assessment are still pending. No clean-security or formal gate acceptance claim. [Changelog](../../CHANGELOG.md) and short local memory are current; no delegation, commits or pushes.
- Read-only documentation validation exited 0: 283 local links resolved with valid line bounds; wiki catalog coverage passed. All 26 protected-file hashes matched pre-edit baselines (source/tests/fixture, toolchain, agent entrypoints, ignore file, wiki index and entire specification). The specification SHA-256 remains the value recorded below. Source contains 28 test declarations; counting them is not test execution.

## 2026-10-14 — Runnable experimental handoff

- Actual manifest, compiler output layout, CLI parser, provider, storage and independent/integration assertions were inspected for the [handoff](../experiment-handoff.md). Semantic search returned stale absent artifacts; direct source inspection was used for facts.
- Parent/human reports: Windows x64 Node 24.14.1 build/typecheck/full test exit 0, 20 pass/0 fail/0 skip; latest simplifier result same. One passing CAS race emitted a LanceDB access-denied version-hint warning. No application tests were newly rerun by documentation.
- Source assertions support literal hash triples, ten two-process races, durable memory/stable IDs/pure stale reads, graph-authoritative export recovery and junction rejection. Four regression fixes retain assertions; exact evidence links and captured developer commit values are in the handoff.
- Final code/security reviews, dependency assessment, Linux and forced-crash/power-loss/TOCTOU/large-store proof are not complete. Human experiment authorization is not G0–G6 acceptance or resolution of Q1–Q9.
- Full specification baseline SHA-256 remains 7c9dcc2f29ca48d7925e2df10dbf4d1dfa0c7426fbb55fa0035505696985a908. This task preserves code/tests and harness/mode/hook/index/ignore settings; no documentation graph is generated. [Changelog](../../CHANGELOG.md) records the unreleased experiment/docs state.
- Documentation-only validation exited 0: 263 local link targets existed with valid line bounds; every wiki page was catalogued. A first regex attempt matched zero links and was discarded; the corrected check required over 100 matches. This is not application-test evidence.
- All seven source-file and five test-suite SHA-256 values matched their pre-edit baselines; root manifest, lockfile and compiler configuration also matched. Lock inspection confirmed optional Windows x64 MSVC and Linux x64 GNU/musl native packages at 0.40.0. This verifies retained lock entries, not Linux execution or dependency security.

## 2026-10-13 — Initial wiki setup

- User scope: documentation-only agent guidance and Carbon Memory; explicitly no knowledge graph, implementation, installs, source scaffolding, third-party copying, Git pushes or gate acceptance.
- Initial tree evidence supplied by the parent task: only the [specification](../OSG_MVP_SPEC.md). No agent entrypoints, memory, wiki, manifests, lockfiles, sources, tests, configs or hooks were found.
- NotebookLM discovery supplied by the parent: five notebooks, none clearly relevant to OmniSpatialGraph; unrelated notebooks were not queried.
- The specification was retrieved with a read-only terminal fallback after the file reader failed twice. Its initial SHA-256 was 7C9DCC2F29CA48D7925E2DF10DBF4D1DFA0C7426FBB55FA0035505696985A908.
- [Documentation decisions](decisions.md) record the limited exception. [Source indexing](concept-carbon-memory.md) means reading and linked summaries only, not a graph or external vector-index refresh.
- [External prototype evidence](../OSG_MVP_SPEC.md:846) is not repository test evidence and must be reproduced in future G0. No gate status is changed.

## 2026-10-13 — Initialization validation

- Read-only PowerShell validation exited 0: 140 relative links resolved with valid line bounds; all 10 wiki pages were catalogued (the index catalogs the nine other pages); the exact required agent header passed and root guidance was 18 lines.
- The specification SHA-256 matched the initial value above, including unchanged §22.
- Tree validation confirmed no graph directory, runtime store, source/test/fixture scaffold, manifest, dependency install, build output, shared hook directory or root changelog was generated.
- The full tree revealed existing Git metadata and standard sample hooks, correcting the parent's incomplete initial observation. Nothing in Git configuration was changed or activated.
- Readbacks covered wiki, all mode guidance and all memory files. Read-only Git ignore checking exited 0: wiki, local harness, graph and runtime-store sample paths were ignored; the two future test-suite sample paths were not ignored. Sample paths were strings only; no files were created.
- Filesystem MCP remained unavailable. Validation is documentation evidence, not application tests or G0 acceptance. See [workflows](workflows.md).
