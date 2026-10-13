# Carbon Memory — Documentation-only Initialization

Carbon Memory combines durable derived wiki documentation, local volatile context, and a curated repository source index. It does not replace the [specification's authority](../OSG_MVP_SPEC.md:17).

## Layers

- **Durable wiki:** this [catalog](index.md) and linked pages. Locally retained but ignored under current user rules; not claimed to be committed/shared.
- **Volatile bank:** [brief](../../.spexcode/rules/memory-bank/brief.md), [context](../../.spexcode/rules/memory-bank/context.md), [active work](../../.spexcode/rules/memory-bank/active.md). Local-only, noncanonical and short. Appendix B requires a pointer rather than a copied product brief ([source](../OSG_MVP_SPEC.md:1184)).
- **Curated source index:** the table below. Indexing here means reading and linked summaries only—not external vector reindexing, graph generation or hook activation.

## Repository source index

| Source | Role and derived destination |
| --- | --- |
| [Specification](../OSG_MVP_SPEC.md) | Normative requirements and original status; informs all wiki pages |
| [Agent guidance](../../AGENTS.md) | Concise guardrails; [agent guide](agent-guide.md) expands navigation |
| [Alternate entrypoint](../../CLAUDE.md) | Defers to root guidance; no separate policy |
| [Project overview](../../README.md) | Spec-only status; [wiki overview](README.md) retains context |
| [Wiki index](index.md) | Catalog of every derived page |

## Command intent and exclusions

Initialization means creating the requested documentation layers from repository evidence. Future refreshes update linked summaries and local task context without asserting implementation or acceptance. This task explicitly overrides the generic graph workflow: **do not use Understand Anything or create, scan, refresh or configure a knowledge graph**. No graph directory, runtime store or graph auto-update hook is authorized.

No new source, installs, third-party copying, pushes or gate approval are included. The [decision record](decisions.md) limits the exception; [workflows](workflows.md) preserves future G0 requirements.
