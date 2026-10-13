# Technology Inventory

All technologies below are **planned**, not installed or configured repository facts.

| Area | Spec requirement | Evidence |
| --- | --- | --- |
| Runtime | Node 22 or 24 LTS; Windows x64 and Linux x64 | [D3](../OSG_MVP_SPEC.md:132) |
| Language | TypeScript; contracts also JSON Schema | [G0](../OSG_MVP_SPEC.md:773) |
| Persistence | LanceDB exactly 0.40.0; Arrow exactly 18.1.0 | [D3](../OSG_MVP_SPEC.md:132) |
| Native packaging | Retain optional Windows/Linux native binaries at the exact pin; do not omit optional dependencies | [Appendix C](../OSG_MVP_SPEC.md:1239) |
| Core hashing | Pure-JS SHA-256, avoiding Node-only core APIs | [R12](../OSG_MVP_SPEC.md:186), [hashing](../OSG_MVP_SPEC.md:474) |
| Parsing | Approach A; Tree-sitter, with WASM preferred; adaptation requires verified provenance and human approval | [ingestion](../OSG_MVP_SPEC.md:609) |

No manifest, lockfile, build tool, test runner, lint configuration, deployment configuration or shared project hook directory was found. Git metadata and standard sample hooks were observed during validation; hook activation was not verified. TypeScript/tooling versions require justified future G0 proposals, not generic defaults ([kickoff](../OSG_MVP_SPEC.md:1246)).

The Linux prototype environment in [§18](../OSG_MVP_SPEC.md:846) is external historical evidence, not this workspace's runtime.
