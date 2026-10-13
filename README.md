# OmniSpatialGraph

Specification-stage project for a standalone, CLI-first, incremental 4D GraphRAG engine. Root has no production app/CLI/manifest. Node.js/TypeScript/LanceDB have been exercised only in an isolated pinned G0 storage experiment.

Start with the [current concept-test scope](docs/OmniSpatialGraph_Concept_Test_Scope.md:1), [v0.5 broader design](docs/OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:1), [agent guidance](AGENTS.md), and [maintainer wiki](docs/maintainer-wiki/index.md). The concept scope overrides conflicting v0.5 requirements for this single-writer phase.

## Current status

No production application or executable exists. Root build/lint/application-test commands are unavailable; specification CLI examples remain proposals. Isolated reproducibility: [`npm --prefix experiments/g0 run install:locked`](experiments/g0/package.json:11), then [`npm --prefix experiments/g0 run verify`](experiments/g0/package.json:17). These are probe commands, not an application quick start.

The [G0 dossier](docs/g0/architecture-feasibility.md) records three reduced checks passed on Windows 10 x64/Node 24.14.1/Lance 0.40.0. Independent six subcommands passed; its outer deadline wrapper stalled and exit was not captured. [Upstream ledger](docs/g0/upstream-ledger.md) identifies conditional rights; no source copied. [Contracts/identity and G1 slices](docs/g0/contracts-proposal.md) remain candidates. Final security/review/readiness and explicit human acceptance remain pending; **G1 is blocked/unstarted**. Concurrency, retention, native branches, G6 and A→B migration are deferred.

## Repository memory

Carbon Memory combines the canonical durable wiki, local-only volatile memory, and indexed repository context. Consult the [Carbon Memory guide](docs/maintainer-wiki/concept-carbon-memory.md). Documentation describes requirements until implementation evidence exists.
