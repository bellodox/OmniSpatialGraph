# Documentation Decisions

These records document current task scope, not new binding product decisions. [Spec decisions](../OSG_MVP_SPEC.md:126) and [human-only questions](../OSG_MVP_SPEC.md:153) retain their authority.

## 2026-10-13 — Documentation-only initialization exception

**Status:** Authorized for this task by the current human instruction only.

**Context:** Q7 limits root files and G0 step 0 limits writes. The user explicitly requested agent entrypoints, wiki, volatile memory and ignore rules before implementation.

**Decision:** Create only the requested documentation and ignore rules; preserve the entire specification, including §22. This narrow exception does not resolve Q7, start or accept G0, approve its plan, permit installation/scaffolding, or authorize third-party adaptation. Future work still follows [G0 restrictions](../OSG_MVP_SPEC.md:1230).

**Alternative excluded:** Running the general graph-based initialization workflow would contradict the explicit instruction. No graph creation, scanning, refresh, configuration or Understand Anything operation is authorized.

**Consequences:** The wiki remains derived navigation. Agent guidance must distinguish planned design from implemented facts. A dated [log](log.md) records initialization instead of a new root changelog; no existing changelog was available.

## 2026-10-13 — Local retention and tool limitations

**Decision:** Honor the requested ignore patterns for the wiki and local harness; protect the future test-suite directory with negations in [ignore rules](../../.gitignore). Durable means retained documentation, not a claim that the wiki is tracked or shared.

**Rationale:** The broad user-required test-name pattern can conceal legitimate future tests. The suite-directory exception reduces this risk; future test fixtures outside that directory need explicit exceptions.

**Tool deviation:** Filesystem MCP is not exposed to this task. Available file tools and read-only terminal validation are used instead. No claim of MCP execution, Git tracking verification or hook activation is made.

## 2026-10-13 — Named root documentation follow-up

**Status:** Authorized by the current human request to generate [README.md](../../README.md) and [CHANGELOG.md](../../CHANGELOG.md).

**Decision:** Improve the existing overview and create an unreleased documentation changelog. This supersedes the initialization-only choice not to create a root changelog, not the historical initialization record. The exception applies to these named documents only; Q7 remains unresolved generally, and no implementation, installation, graph operation or gate approval is authorized.

**Evidence note:** The wiki exclusion in [ignore rules](../../.gitignore:6) is currently commented out. Earlier initialization ignore evidence is historical, not proof of current wiki ignore or distribution status. Ignore settings are unchanged by this follow-up.

## 2026-10-14 — Bounded experiment and documentation handoff

**Status:** Authorized by current human instruction; not a binding product-spec change or gate acceptance.

**Context:** Implementation, independent testing and simplification are reported complete. Old spec-only descriptions no longer match actual manifests/source/tests. The entire specification, including §22, is frozen for this handoff.

**Decision:** Publish [runnable commands, attributed proofs and limitations](../experiment-handoff.md), refresh derived navigation/status and short local memory, and record incomplete proof/review items honestly. Experiment authorization supersedes historical installation/implementation restrictions within scope; Q1–Q9 and formal G0–G6 approval remain human-only. No third-party copying, source/test changes, persona delegation, harness/mode/hook/index/ignore configuration or graph generation is authorized here.

**Rationale and alternatives:** Direct compiled CLI examples match actual parsing/build output without assuming a global command shim. The independently written compiler API provider avoids upstream copying for this experiment; it is not a decision to replace the specified Tree-sitter Approach A. Claiming full MVP/gate coverage or a clean security verdict would exceed the evidence.

**Consequences:** Windows results remain attributed reports, Linux/forced-crash/TOCTOU/large-store evidence is absent, rules hashes remain unavailable, and final parent code/security reviews including dependencies are pending. The [checklist](../tasks/todo.md) distinguishes completed supported implementation/proofs from unproved planned criteria. Historical decisions above remain intact.

## 2026-10-14 — OSG-only operational memory and prototype reconciliation

**Status:** Current human-authorized documentation scope, superseding earlier memory procedures, not a product-spec change or formal G5 acceptance.

**Decision:** Use only the public OSG CLI for operational context/history/sync/remember, preserving the initialized repository store. Reconcile necessary wiki/root/historical-document statements as derived documentation only; no legacy-bank/NotebookLM/documentation-graph operations. Entire specification, source/toolchain/tests, harness/settings/hooks/index/ignore and Git index remain unchanged; no delegation, commits or pushes.

**Rationale:** The installable private prototype now has a worker privacy boundary, core barrel/five typed exports, fresh consumer proof and completed scoped reviews. Earlier pending statuses, three-High audit results and no-clean-install claims must remain historical rather than current. Zero audit findings do not resolve the Sharp range mismatch, owner licensing or native/LGPL distribution conditions ([current evidence](../public-prototype.md)). Correcting the packaged README is necessary for accurate user instructions; retaining its stale pending status solely to avoid repack was rejected. The old archive is preserved, not silently rebuilt; parent-owned repack/new integrity evidence is required.
