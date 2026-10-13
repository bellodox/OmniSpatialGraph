# OmniSpatialGraph (osg)

OmniSpatialGraph is a **planned** standalone, CLI-first Node.js/TypeScript temporal knowledge graph and GraphRAG engine on embedded LanceDB. It is designed to give humans and agents workspace memory across sessions and branches, with source citations and content-addressed commits ([purpose and scope](docs/OSG_MVP_SPEC.md:43)). GraphRAG combines retrieval with graph traversal to answer questions using related evidence.

## Current status

**Specification-only; G0 has not started.** There is no implemented application, package manifest, installed project dependency set, source scaffold or test suite. No runnable CLI, build, lint, test or single-test commands exist, so there is no application quickstart yet. Documentation initialization is not implementation or gate acceptance ([authoritative status](docs/OSG_MVP_SPEC.md:922)).

## Planned MVP

- One temporal data model for repository elements with 1D file-line extents and a physical 4D moving-object fixture—not a production sensor platform.
- Incremental repository indexing, history, branching and evidence-backed GraphRAG retrieval.
- Source citations with staleness detection, content-addressed commits and provenance-labeled agent memory.
- A thin CLI over an importable core, with storage and indexing behind separate interfaces.

See [scope](docs/OSG_MVP_SPEC.md:43), [architecture boundaries](docs/OSG_MVP_SPEC.md:272) and [build gates](docs/OSG_MVP_SPEC.md:762). The MVP excludes a daemon, MCP server and VS Code dependency; sensor ingestion, distributed writers, signatures and tight host integration are outside the MVP.

### Planned technology

| Technology | Specified target—not installed or verified here |
| --- | --- |
| Runtime | Node.js 22 or 24 LTS |
| Language | TypeScript; tooling versions to be proposed during G0 |
| Embedded storage | LanceDB 0.40.0 |
| Columnar data | Apache Arrow 18.1.0 |

These are [specification targets](docs/OSG_MVP_SPEC.md:132), not claims about the local environment. MIT licensing is intended by the specification; no license file is present yet.

## Start here

1. Read the authoritative [MVP specification 2.0](docs/OSG_MVP_SPEC.md) and [root agent guidance](AGENTS.md). Current human instruction takes precedence; derived documentation does not override the specification.
2. For future development, begin with G0 read-only discovery: host and repository reports, a small-slice plan and checklist, then stop for Bello's approval before scaffolding or installation ([kickoff procedure](docs/OSG_MVP_SPEC.md:1230)).
3. Keep [Q1–Q9](docs/OSG_MVP_SPEC.md:153) human-only. Evidence reports and human approval are required for gate acceptance.

The [maintainer wiki index](docs/maintainer-wiki/index.md) provides derived navigation when available. The wiki and local harness are locally maintained context, not guaranteed distributed documentation; the local memory bank is gitignored and noncanonical. Use the specification and root guidance if those local resources are absent.

See [CHANGELOG.md](CHANGELOG.md) for documentation history. The current request authorizes these named root documents only; it does not generally resolve Q7 or authorize implementation.
