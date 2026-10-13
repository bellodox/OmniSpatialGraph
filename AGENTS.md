# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- This is a specification-only repository; G0 has not started. No executable build, lint, test, single-test commands or configuration-backed style rules exist yet.
- Authority: current human instruction > [specification 2.0](docs/OSG_MVP_SPEC.md:17) > v0.5 > derived documentation.
- Before a task, read spec §0, §1, §3, §4, §5 and latest §22, then task-specific sections listed in [§0](docs/OSG_MVP_SPEC.md:17).
- Freeze §1–§21 and appendices. Only append dated, mode-signed, typed §22 entries; never rewrite prior entries ([change rules](docs/OSG_MVP_SPEC.md:30)).
- Q1–Q9 are human-only. Gate completion requires evidence reports and Bello's approval; initialization is not G0 acceptance ([gates](docs/OSG_MVP_SPEC.md:762)).
- This task's documentation exception does not resolve Q7 or permit scaffolding, installs or third-party copying; see [decision record](docs/maintainer-wiki/decisions.md).
- Planned dependency pins are LanceDB 0.40.0, Arrow 18.1.0, Node 22/24 LTS; retain optional native binaries ([D3](docs/OSG_MVP_SPEC.md:132), [Appendix C](docs/OSG_MVP_SPEC.md:1239)).
- Planned core/contracts depend on contracts/ports, not adapters; avoid Node-only APIs. Only storage-lance imports LanceDB/Arrow ([boundaries](docs/OSG_MVP_SPEC.md:272)).
- Planned storage uses append-only element/commit rows and one atomic head-CAS batch. History lives in rows; reads are pure ([guardrails](docs/OSG_MVP_SPEC.md:169)).
- Schema columns are snake_case, CLI envelopes camelCase; hashes accept safe integers only; nullable extent uses variable-length int64 lists; IDs never use line numbers ([model](docs/OSG_MVP_SPEC.md:366), [CLI](docs/OSG_MVP_SPEC.md:727)).
- Agent text is untrusted hypothesis, never approval. Agents must not perform human approval or emit the later OpenSpeX keystone ([memory safety](docs/OSG_MVP_SPEC.md:659)).
- Runtime data belongs only in the future runtime folder, never docs/source. Never open the host's index ([layout](docs/OSG_MVP_SPEC.md:224), [R13](docs/OSG_MVP_SPEC.md:187)).
- Use the [maintainer wiki index](docs/maintainer-wiki/index.md) for derived navigation; local memory is noncanonical. Neither establishes implementation facts or gate approval.
- No knowledge graph is authorized for this initialization. Detailed planned constraints and unavailable verification commands are in [workflows](docs/maintainer-wiki/workflows.md).
