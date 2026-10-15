# Workflows and Verification

## Checkout and validation

Use [installation/development commands](../../README.md#install) with Node 22/24 LTS, lifecycle scripts disabled and optional natives retained. Build explicitly before tests. Invoke the [public worker launcher](../../packages/cli/src/public.ts:57), not the internal backend, for CLI diagnostic isolation.

The [manifest](../../package.json:26) provides build, typecheck, test and prepack; no lint/docs-check, prototype-pack alias or automated gate runner is configured. Packaging rebuilds output; the [consumer helper](../../tools/consumer-proof.mjs) replaces its designated archive/consumer and installs/tests dependencies. These require task authorization and are not read-only documentation checks. Historical package proof is not later source parity.

For documentation work, inspect actual Git status including untracked files/branch/revision, current human scope, required specification sections and relevant sources. Preserve unrelated work and the entire specification, including §22. Check all retained document links, anchors, line bounds, fences and wiki catalog coverage; check incoming references before deleting redundant documents. Prefer heading anchors for shifting documentation. Compare protected-file hashes and final diff/status; do not add a checker dependency or claim application tests were rerun. Documentation navigation changes require authorization, not code-index or harness changes.

## Memory maintenance

**OSG alone is operational memory**, under current human experimental authorization irrespective of formal G5. The wiki explains durable architecture/rationale/runbooks; it is not a parallel task diary. See [memory policy](concept-carbon-memory.md) and [portable agent guidance](../agent-memory-rules.md).

1. Retrieve task context through the public launcher, with an 800-token maximum. Check exit, success, error and warnings; no output is not proof of success. Inspect provenance against actual Git/source. The graph branch is not the Git branch.
2. Resolve actual entity IDs and inspect history before edits. Read source directly when citations/anchors are stale or relevant declarations were skipped. An empty result is not absence; refine task terms once or use entity context. Excluded local rules/task plans may need an accurately related indexed entity, not an invented ID.
3. Validate the authorized work. Only with authorized writes and compatible format, sync changed source, retrieve again as needed, then remember concise scope/rationale/observed results against resolved IDs. Inspect unresolved-link/supersession warnings and capture returned episode/head IDs before claiming persistence. A delegated read-only task must leave writes to its designated parent.

The repository migration to format 2 is [complete](../public-prototype.md#repository-migration); retain its identity, history and verified backup. Ordinary authorized sync/remember is available. The recorded 742 ambiguous-declaration warnings mean incomplete coverage, not automatic fixes. Fresh current citations do not refresh old episode anchors. No legacy-bank/NotebookLM/documentation-graph fallback or external-index refresh is permitted.

## Recovery

- **Stale head:** four total attempts with 50–250 ms jitter may exhaust with exit 3. With write authorization and compatible format, sync once and repeat the identical failed operation once; persistent conflict requires stop/report. Do not increase retries or promise every writer succeeds.
- **Ambiguous worker failure:** inspect context/history and integrity before retrying; the write may have committed. A post-commit export failure does not justify remembering again. Preserve returned commit metadata and, within authorized recovery scope, replay export from graph authority after resolving the export-path problem.
- **Format/initialization:** migration-required exit 4 or unsupported-format exit 9 requires stop/report. Missing/unavailable/headless stores are not permission to initialize, repair or replace permanent memory. Never automatically migrate or reinitialize.
- **Maintenance:** backup, migration, replacement restore and doctor fixing require explicit human authorization and appropriate stopped-writer safeguards. Read-only health/integrity checks do not grant repair permission. See [upgrade](../../README.md#upgrading-existing-data) and [backup/restore](../../README.md#backup-and-restore).
- **Partial initialization:** sharing failures can leave storage initialized before ignore publication. Report path-free recovery guidance, release sharing restrictions and rerun init only in the authorized target; preserve workspace identity. Coverage is injected, not real OS-lock proof. Init may alter its workspace's ignore file, so use disposable experiments and never the host index.
- **Privacy:** sync retracts current facts, not old rows. For affected pre-fix data use a fresh disposable workspace/store, not a purge claim. Never store secrets/personal data/raw source dumps; redact local diagnostics before sharing. Current ignore/access policy applies even to historical snippets.

Commit selectors use actual full IDs or unique prefixes of at least 12 characters. Recovery must not invent IDs, bypass exclusions, rewrite rows, erase history or silently restore other work. Integrity verification does not prove source freshness, application correctness, security certification or approval.

## Formal gate workflow

[Appendix D](../OSG_MVP_SPEC.md:1299) and [§15](../OSG_MVP_SPEC.md:762) govern separately authorized formal gates. Each needs evidence and Bello's approval; the experiment does not supply acceptance. Windows and Linux/crash trials are separate evidence. Classify before/after-acknowledgement kills; zero pre-acknowledgement kills is inconclusive. External specification prototype results are not repository passes. Q1–Q9 remain human-only and the entire specification remains frozen.
