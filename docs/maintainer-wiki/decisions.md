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
