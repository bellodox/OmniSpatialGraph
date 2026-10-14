# OmniSpatialGraph (osg)

OmniSpatialGraph targets a standalone, CLI-first Node.js/TypeScript temporal knowledge graph and GraphRAG engine on embedded LanceDB. A human-authorized **experimental CLI** now provides persistent source facts, agent episodes, lexical context, history, verification and export recovery. The [MVP specification](docs/OSG_MVP_SPEC.md:43) remains the canonical product target, not a description of complete experimental coverage.


Agreed experiment implementation/testing/documentation and final reviews complete. Final targeted Code Reviewer: **APPROVE WITH SUGGESTIONS**, no concrete blocker. Final Vulnerability Checker: **NO BLOCKING FINDINGS** within the Windows private-experiment scope; mandatory-case application BLOCK resolved, original hard-link/protected-state clearance carried forward. No clean-security verdict, distribution clearance or formal gate acceptance ([final evidence](docs/experiment-handoff.md)).

Windows mandatory exclusions case-fold BEFORE traversal, nested ignore-file reads and content reads; attempted negations fail. Coverage includes mixed-case runtime, task, harness, Git, analysis, build/dependency directories, sensitive filenames, environment-file variants and declaration extensions. Original paths, logical IDs, hash case semantics and collision detection are unchanged. Fresh stores contain no excluded facts/rows/history/context; repeat sync adds no rows. ([provider](packages/indexing-kilo/src/index.ts:44), [fresh-store proof](tests/security.test.mjs:214)).

**Affected-store privacy warning:** standard sync retracts previously leaked facts from current state/context only. Every original non-head row is preserved; append-only history and old-commit views remain accessible. Use a **fresh disposable workspace/store** for privacy, not a purge or historical-cleanup claim. ([affected-store proof](tests/security.test.mjs:284)).

Known Low diagnostic-path disclosure remains. Image/embedding features remain disabled; no reachable exploit was identified. Dependency audit still has 3 High entries via sharp; human owner-reviewed disposition is required before enablement/distribution and by 2026-10-21. No Linux/macOS/crash/power-loss/TOCTOU/network-filesystem/large-store evidence is claimed.

## Current status

**Private runnable experiment; agreed work and final reviews complete, no formal G0–G6 acceptance or distribution clearance.** Prior verified Windows x64 Node 24.14.1 build/typecheck/full suite exits 0: 35 pass, 0 fail, 0 skip; not rerun by the final checker. Final focused security run: exit 0, 5 pass/0 fail/0 skip; in-memory compiler comparison matched seven existing outputs, zero temporary files, status unchanged. Earlier targeted 2-pass and 33 full/7 focused, 31 full/3 security, 28/20-pass results remain historical. Three additional concurrency rounds supplement historical 20-round stress. Previous fresh audit exit 1 retains 3 High package entries through LanceDB → Transformers → sharp 0.33.5; no reachable image-decoding application path established, image/embedding features disabled. Human owner-reviewed disposition is required before enablement/distribution and by **2026-10-21**; agents cannot approve it. Confirmed Low raw diagnostic local-path disclosure requires log redaction; future sanitization is not implemented. Linux/macOS/non-Windows case-insensitive filesystems/TOCTOU/crash/power-loss/network-filesystem/large-store/native-LGPL closure/independent clean install remain unverified. See [evidence, advisories and limitations](docs/experiment-handoff.md); documentation did not rerun application checks/audits.

## Quick start from the project root

Use Node 22/24 LTS and retain optional native packages. The [manifest scripts](package.json:7) support:

```bat
npm.cmd ci --include=optional
npm.cmd run build
npm.cmd run typecheck
npm.cmd test
node dist/cli/src/index.js help --json
```

For runnable workspace, agent start/end and recovery examples, use the [experimental handoff](docs/experiment-handoff.md). Init writes runtime data and can amend the selected workspace's ignore file; use a disposable workspace. The [compiled memory API](packages/core/src/memory.ts:9) is available at dist/core/src/memory.js after build, with separate graph/hash modules and no barrel export.

## Planned MVP

- One temporal data model for repository elements with 1D file-line extents and a physical 4D moving-object fixture—not a production sensor platform.
- Incremental repository indexing, history, branching and evidence-backed GraphRAG retrieval.
- Source citations with staleness detection, content-addressed commits and provenance-labeled agent memory.
- A thin CLI over an importable core, with storage and indexing behind separate interfaces.

See [scope](docs/OSG_MVP_SPEC.md:43), [architecture boundaries](docs/OSG_MVP_SPEC.md:272) and [build gates](docs/OSG_MVP_SPEC.md:762). The MVP excludes a daemon, MCP server and VS Code dependency; sensor ingestion, distributed writers, signatures and tight host integration are outside the MVP.

### Planned technology

| Technology | Experiment pin / support |
| --- | --- |
| Runtime | Node.js 22 or 24 LTS |
| Language | TypeScript 5.9.3 |
| Embedded storage | LanceDB 0.40.0 |
| Columnar data | Apache Arrow 18.1.0 |

Pins are in the [manifest](package.json:12) and [lockfile](package-lock.json); reported Windows execution is distinct from Linux coverage. The independent compiler API provider is not Tree-sitter/Approach A; retrieval is lexical-only and rules hashes are unavailable. MIT licensing is intended by the specification; no license file is present yet.

## Start here

1. Read the authoritative [MVP specification 2.0](docs/OSG_MVP_SPEC.md) and [root agent guidance](AGENTS.md). Current human instruction takes precedence; derived documentation does not override the specification.
2. For this authorized experiment, use the [handoff](docs/experiment-handoff.md) and [checklist](docs/tasks/todo.md). Formal gate work still follows the human approval [kickoff procedure](docs/OSG_MVP_SPEC.md:1230); experiment success does not supply acceptance.
3. Keep [Q1–Q9](docs/OSG_MVP_SPEC.md:153) human-only. Evidence reports and human approval are required for gate acceptance.

The [maintainer wiki index](docs/maintainer-wiki/index.md) provides derived navigation when available. The wiki and local harness are locally maintained context, not guaranteed distributed documentation; the local memory bank is gitignored and noncanonical. Use the specification and root guidance if those local resources are absent.

See [CHANGELOG.md](CHANGELOG.md) for unreleased experiment/documentation history. The current experiment authorization does not resolve Q7 generally, authorize third-party copying or grant gate acceptance.
