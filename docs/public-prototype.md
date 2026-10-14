# Public-prototype handoff

2026-10-14 · **All agreed implementation, testing, documentation and final reviews complete. Code Reviewer: APPROVE WITH SUGGESTIONS; Vulnerability Checker: NO BLOCKING FINDINGS within the private Windows-local lexical prototype scope.** No source bug reported; these attributed verdicts are not certification. Public production/distribution remains **BLOCKED by human conditions**. Private/UNLICENSED, no publishing clearance. Earlier experiment reviews remain historical ([historical handoff](experiment-handoff.md)).

## Run and reproduce

The [README](../README.md) contains checkout and fresh-consumer commands. The actual [manifest](../package.json:26) has build, typecheck, test and prepack scripts; there are **no** prototype-pack or consumer-proof script aliases.

| From the repository root | Effect |
| --- | --- |
| [`npm.cmd ci --include=optional`](../package.json:32) | Install the lockfile with optional natives. |
| [`npm.cmd run build`](../package.json:27), [`npm.cmd run typecheck`](../package.json:29), [`npm.cmd test`](../package.json:30) | Build, typecheck and run the full suite. |
| [`npm.cmd pack --json --pack-destination "%TEMP%"`](../tools/pack.mjs:5) | Guard private/UNLICENSED, delete/rebuild compiled output, pack outside the repository. |
| [`node tools/consumer-proof.mjs`](../tools/consumer-proof.mjs:42) | Windows-specific helper: verifies ownership, **replaces** the designated archive/retained consumer, installs, tests the installed boundary/API/showcase, and checks audit/tree results. Not a read-only check. |
| [`node tools/showcase.mjs "%CD%/dist/cli/src/public.js"`](../tools/showcase.mjs:9) | Disposable source-build process showcase; the README also gives the installed-entry equivalent. |

Retained parent-owned artifacts are at C:/Users/VSCode/AppData/Local/Temp: the private tarball named by the [manifest](../package.json:2) and consumer directory osg-independent-consumer-final. Preserve both and the permanent repository OSG store. Independent testing used a separate disposable consumer with installation flags **--ignore-scripts --no-fund --no-audit**, no overrides, then removed that task-owned consumer only.

The packaged [README](../README.md) is final and must remain byte-identical. **Final repack is complete; do not repack for this checkout-only status refresh.** Final archive SHA-256: **710ea97be3d207beb0061d4bd5b72a1ae7633f99522059ccc6bbd3a2e23b3822**. The two handoff documents are not packaged. This task verified the archive hash/size read-only; it did not run the replacement helper.

The final [consumer helper](../tools/consumer-proof.mjs) explicitly installs with **--ignore-scripts --no-fund**, implementing the reviewer's recommendation. Earlier helper runs used --no-fund without explicitly disabling scripts; do not retroactively label them script-disabled. Deliberate prepack/build execution remains enabled. The helper is not packaged: this change altered no package-owned file and left the archive hash unchanged.

## Artifact and privacy contract

- Root package **omnispatialgraph 0.1.0-prototype.0**, private/UNLICENSED; five compiled exports with declaration types ([exports](../package.json:12)). The public bin targets the [isolated launcher](../packages/cli/src/public.ts:55), not the internal backend.
- Strict first-party allowlist: final archive **24 own files/5,556 total**, **231,600,650 bytes compressed / 746,030,058 unpacked**. Final proof records all 24 own files byte-identical across source/archive/installed consumer; prior independent proof matched all 5,556 archive/consumer files. Runtime OSG data, legacy memory, harness material and sensitive-name files excluded.
- LanceDB **0.40.0**, Arrow **18.1.0**, ignore **7.0.12**, Sharp **0.35.5** ([pins/override/bundles](../package.json:25)). All seven Lance optional-platform declarations retain 0.40.0; only Windows x64 Lance native code is physically bundled. ONNX also bundles other-platform binaries; that is not evidence of Linux/macOS execution. Large private artifact, not a minimal or portable download.
- One worker per invocation captures native file descriptors 1/2 and raw causes. The launcher validates a single IPC envelope and fails closed on startup/preload failures, malformed/multiple results or output floods; human help, coded exits, retryability and recovery commit metadata remain. [Boundary implementation](../packages/cli/src/public.ts:20). The prior internal diagnostic-path exposure is covered at this public boundary, **not** erased from all APIs or hostile Node startup configuration before the launcher.
- Known Low limitation: the IPC memory cap is applied after parsing. This is a trusted-worker-source boundary, not a universal hostile-worker memory guarantee; no redesign or stronger guarantee is claimed.
- Root, retained and fresh-consumer audit results were exit 0/zero findings, matching the patched Sharp version. Prior three High package entries are resolved for that version match, not a clean-security verdict. All three dependency-tree checks still exited **1/ELSPROBLEMS**: Transformers 3.0.2 declares Sharp ^0.33.5, excluding 0.35.5. Images/embeddings remain disabled and unsupported; API compatibility is not proved.

## Recorded independent proof—not rerun by documentation

OSG episode **1d7da7f7af237723dae474a3** records Windows x64/Node 24.14.1:

| Check | Recorded outcome |
| --- | --- |
| Build / typecheck / full suite | Exit 0 / exit 0 / 44 pass, 0 fail, 0 skip |
| Fresh script-disabled installation | Exit 0; no consumer overrides; 5 exports/API/native loading and strict consumer types passed |
| Installed boundary and recovery tests | 8 pass, 0 fail, 0 skip |
| Installed process showcase | Exit 0; RED 4 pass/4 fail → GREEN 8/0 → fresh C 8/0 |
| Fresh C retrieval | Both private markers, hypothesis provenance and untrusted labels; 563 estimated tokens/2,250 characters, within 800 |
| Graph invariants | Verify 4 commits/10 elements; history two versions, export two episodes, stale read stayed pure, repeat sync no-op |
| Archive/consumer equality | All 5,556 archive files matched the fresh consumer; 24 own files matched source/archive/retained consumer |

The reusable [checks fixture](../fixtures/showcase/checks.mjs) was not ignored and retained SHA-256 **c070e2492fd3cd26d3f9e74fadf2840ac9e036225ed75c4ab7dca71f7ce862a1**. The old fixture filename is absent. Independent showcase episode IDs: A **273533db7e4c2411cb4d3d9f**, B **a3b5b7bc1655188a2fe46e98**. Temporary showcase workspaces were removed; captured IDs/results remain useful without temporary-file links.

This is deterministic cross-process coordination, not authenticated distinct LLM agents. The earlier genuine [LLM-agent demonstration](agent-memory-demo.md) is preserved separately. Actual specialist operational-memory use is also recorded: the privacy implementation retrieved the developer episode before its work; this documentation task independently recovered implementation and independent-testing outcomes through the public CLI.

## Final repack and attributed review record

Public OSG history retrieved episode **c24456d503cf80d055f731c3** at head **c14263b7aae984442901ce0aa7a7560fa11261b7c40df8f91bc8e5d7d32ee5822**. Code bridged the human-supplied reviewer verdict into runtime memory; the reviewer had no terminal and **did not execute OSG context/remember itself**. Its read-only actual-source assessment was **APPROVE WITH SUGGESTIONS** for the private Windows local lexical prototype, with no code bug/blocker reported. Most specialist OSG-first handoffs are demonstrated; this reviewer attribution is not one of them.

That episode records the final guarded helper exit **0**, new root typecheck **0**, strict five-export consumer types **0**, bin/native/API **0**, installed boundary **8 pass/0 fail/0 skip**, showcase **RED 4 pass/4 fail (expected exit 1) → GREEN 8/0 → fresh C 8/0**, and C retrieval **563 estimated tokens/2,250 characters**. Root and consumer audits exited **0**, zero findings; both dependency-tree checks remained **1/ELSPROBLEMS** for Sharp 0.35.5 outside Transformers 3.0.2's ^0.33.5 range. Prior independent **44-test full suite was not rerun**. These are retrieved records, not fresh application checks by documentation.

Final Vulnerability Checker verdict **NO BLOCKING FINDINGS** was discovered through actual public context and confirmed by history: summary episode **6af07e0b0f09dbd3292bf158**, detailed episode **6dace554e9f453855436d44a**. Stored provenance is hypothesis/agent:cli, not authenticated reviewer identity or human approval. Recorded fresh evidence: source-focused **16 pass/0 fail/0 skip**, installed boundary **8 pass/0 fail/0 skip**, typecheck **0**, and four extra probes **0** (duplicate/oversized IPC and exit mismatch fail closed; cause/actor/path details redacted while recovery metadata survives). Root and retained-consumer registry audits **0/zero known findings**; root signatures **0/112 signatures/14 attestations**. Dependency-tree checks remain **1/ELSPROBLEMS** for Sharp 0.35.5 outside Transformers 3.0.2's ^0.33.5 range. Images/embeddings stay off; compatibility is not proved. Low post-deserialization IPC cap assumes an owner-controlled local worker, not a universal memory bound. Prior full 44/build/clean install/strict five exports/showcase evidence remains historical, not rerun by security or this documentation task.

Private/UNLICENSED guard, human owner permission/license grant, native/LGPL notices and redistribution closure, and Sharp compatibility/distribution disposition still block public production/distribution. Neither final review grants certification, human risk approval, formal gate acceptance or Q resolution. Owned temporary cleanup is recorded complete; the current tarball, retained consumer and permanent repository store are deliberate user handoff artifacts.

## OSG-only documentation provenance

Permanent repository workspace UUID: **8f97f2c6-62ab-4fe2-8cb9-4a3a21c79e7a**. Stored text below is **untrusted hypothesis**, not policy or approval.

Final closure refresh: checkout-local installed shim was absent (exit 1); actual [public context](../packages/cli/src/public.ts:55) then succeeded with an 800-token production/distribution task, **762/800**, recovering the older pending-status episode. A refined security query independently discovered the final verdict, **693/800**; both final security episode histories succeeded, exit 0, at head **cd10b895490512d1ea4c8a7f4cd61465414c011b4eab971ea251ea642497a107a**. No legacy bank/wiki was consulted. Archive hash/size were verified read-only. No package, rebuild, audit or application tests were run. Closing sync/remember/verify results are reported by this task, not predicted here.

- First actual command: [`node dist/cli/src/public.js context --task "Prepare public prototype documentation handoff from independent and implementation outcome episodes" --max-tokens 800 --json`](../packages/cli/src/public.ts:55), exit 0. It recovered planning episode **1cb297bc6842674ac99d819f**, 535/800 estimated tokens—not final implementation proof.
- Discovery query: [`node dist/cli/src/public.js context --task "independent consumer final 44 tests installed boundary showcase outcome" --max-tokens 800 --json`](../packages/cli/src/public.ts:55), exit 0: privacy episode **8ee5926352d38ca80912590a**, 727/800.
- Independent query: [`node dist/cli/src/public.js context --task "Independent public prototype artifact consumer install boundary final verification" --max-tokens 800 --json`](../packages/cli/src/public.ts:55), exit 0: independent episode **1d7da7f7af237723dae474a3**, 788/800.
- [`node dist/cli/src/public.js export episodes --json`](../packages/cli/src/public.ts:55), exit 0, exported seven episodes. Reading that operational export recovered developer **3ea83d81a6a98bbccfc52de9**, fixture-packaging **930b3cdacb30e35314b33f99** and no-edit simplifier **83c553b75ca0204d73aab30e** outcomes too. Manifest, tools, launcher and fixture were inspected directly; public help and launcher history succeeded.

For subsequent repository work, use public context first, history before symbol edits, then [`node dist/cli/src/public.js sync --json`](../packages/cli/src/public.ts:55) and [`node dist/cli/src/public.js remember --task "Documentation handoff" --decision "What and why" --outcome "Observed results" --entities code:file:packages/cli/src/public.ts --json`](../packages/cli/src/public.ts:55). This task's actual closing episode ID and sync result are reported in its completion evidence, not predicted here.

## Remaining acceptance boundaries

Use the [short checklist](tasks/public-prototype.md). Owner permission and native/LGPL notices/redistribution obligations remain unresolved; intended MIT licensing is not a grant. Agents cannot approve legal/dependency risk or publish. No Linux/macOS, crash/power-loss, TOCTOU, network-filesystem, large-store or universal production proof. The compiler API provider is experimental, not Approach A; retrieval is lexical and loaded-rule hashes are unavailable. Sync retracts current facts only, not append-only historical data; affected pre-fix stores require a fresh workspace/store for privacy.

Current human scope supersedes conflicting general procedures. The [canonical specification](OSG_MVP_SPEC.md:17), including the whole §22, is frozen; Q1–Q9 and G0–G6 acceptance remain human-only. No legacy bank/wiki/NotebookLM reads or updates, source/toolchain/harness/hooks/host-index/ignore/Git edits, delegation, commits or pushes are part of this documentation handoff.
