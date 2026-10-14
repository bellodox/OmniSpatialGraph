# Open Work

The human-authorized standalone experiment is runnable; no formal G0–G6 acceptance is claimed. Historical [spec status](../OSG_MVP_SPEC.md:926) is preserved, not rewritten. See [handoff evidence](../experiment-handoff.md) and [task checklist](../tasks/todo.md).


Agreed experiment implementation/testing/documentation and final reviews complete. Final targeted Code Reviewer: **APPROVE WITH SUGGESTIONS**, no concrete blocker. Final Vulnerability Checker: **NO BLOCKING FINDINGS** within targeted Windows private-experiment scope; mandatory-case application BLOCK resolved, original hard-link/protected-state clearance carried forward. No clean-security verdict, distribution clearance or formal gate acceptance. Human risk decisions below remain outstanding; no pending agent review cycle.

Windows mandatory exclusions case-fold BEFORE traversal, nested ignore-file reads and content reads; attempted negations fail. Coverage includes mixed-case runtime, task, harness, Git, analysis, build/dependency directories, sensitive filenames, environment-file variants and declaration extensions. Original paths, logical IDs, hash case semantics and collision detection are unchanged. Fresh stores contain no excluded facts/rows/history/context; repeat sync adds no rows. ([provider](../../packages/indexing-kilo/src/index.ts:44), [fresh-store proof](../../tests/security.test.mjs:214)).

**Affected-store privacy warning:** standard sync retracts previously leaked facts from current state/context only. Every original non-head row is preserved; append-only history and old-commit views remain accessible. Use a **fresh disposable workspace/store** for privacy, not a purge or historical-cleanup claim. ([affected-store proof](../../tests/security.test.mjs:284)).

Known Low diagnostic-path disclosure remains. Image/embedding features remain disabled; no reachable exploit was identified. Dependency audit still has 3 High entries via sharp; human owner-reviewed disposition is required before enablement/distribution and by 2026-10-21. No Linux/macOS/crash/power-loss/TOCTOU/network-filesystem/large-store evidence is claimed.

## Outstanding human risk and separately authorized evidence gaps

- Final scoped reviews are complete, not blanket security clearance. Non-Windows case-insensitive filesystems remain a limitation, not a pending mandatory fix in this closure.
- Prior verified Windows x64 Node 24.14.1 build/typecheck/full suite exit 0: 35 pass/0 fail/0 skip, not rerun by final checker. Final focused security command exit 0: 5 pass/0 fail/0 skip; in-memory compiler comparison matched seven existing outputs, zero temporary files, status unchanged ([command/provenance](../experiment-handoff.md)). Earlier targeted 2-pass, 33 full/7 focused, 31 full/3 security and 28/20-pass results historical. Three extra concurrency rounds supplement historical 20-round stress. Assertions retained; documentation did not rerun checks/audits.
- Fresh audit exit 1: 3 High package entries through LanceDB → Transformers → sharp 0.33.5; [advisories/disposition](../experiment-handoff.md). Previous checker found no reachable image-decoding app path; image/embedding disabled. **Human owner-reviewed deferral needed before feature enablement or distribution and by 2026-10-21**; agents cannot approve it. Private experiment is not distribution clearance. Native/LGPL closure and independent clean install unverified. Signature audit exit 0 (114 signatures/10 attestations) is not vulnerability/license clearance. Preserve pins; no arbitrary upgrade.
- Lock comparison reports 139 external entries/0 metadata gaps, 113 restored, 0 existing-version/optional-flag drift; LanceDB 0.40.0/Arrow 18.1.0/all seven native packages retained. Static hard-link sentinel bytes/mtime, nested ignore privacy and protected-state public rejection have [regression evidence](../../tests/security.test.mjs:29), not hostile TOCTOU proof. Confirmed Low raw diagnostic local-path disclosure: redact shared logs; future sanitization is not implemented.
- Retain the passing CAS run's LanceDB access-denied version-hint warning for assessment.
- Unverified: Linux execution (WSL Ubuntu 24.04 has no Node), macOS/non-Windows case-insensitive filesystems, forced-crash/power-loss, TOCTOU, network filesystems and measured large-store behavior. Explicit rename chains, unchanged-file parse skipping and backup-copy recovery are not established by the inspected assertions. These gaps are not formal passes or unfinished tasks in the agreed closure.
- Init failure coverage models a headless table, not process termination; missing-native coverage uses isolated module-resolution injection, not binary deletion. Staging cleanup after abrupt termination is not proved; table rename/config hard-link publication relies on local-filesystem behavior ([details](../experiment-handoff.md)).

## Next authorized gate workflow, not started here

Follow [Appendix D](../OSG_MVP_SPEC.md:1299): discover the host, check this now-documentation-initialized repository, prepare the G0 plan/checklist and stop for Bello's approval. Report the documentation exception rather than treating extra files as implicit implementation permission.

Reported Windows Node 24.14.1 and manifest pins replace the prior tooling unknowns for this experiment only. Host rule loading, custom-mode permissions and Linux execution remain unverified; rule hashes are explicitly unavailable. No hook configuration is inspected or changed by this handoff.

## Human-only questions

[Q1–Q9](../OSG_MVP_SPEC.md:153) remain unresolved by agents: emitter format, receipt unit, signing, emitter revision, future determinism, export retention, root-file policy, privacy/legal review and approval of each third-party adaptation. Current defaults remain binding.

Future G0 must reproduce T16–T24, T29, T33 and T35 with separate Windows/Linux evidence; see [workflows](workflows.md).
