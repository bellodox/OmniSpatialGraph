# Technology Inventory

Manifest/lock facts and reported execution are distinguished below. See the [handoff](../experiment-handoff.md) for provenance and commands.

| Area | Experiment fact / target distinction | Evidence |
| --- | --- | --- |
| Runtime | Manifest supports Node 22/24 LTS; reported Windows x64 Node 24.14.1 | [Manifest](../../package.json:5), [reported evidence](../experiment-handoff.md) |
| Language/build | TypeScript 5.9.3; strict NodeNext compilation to dist; Node types 24.10.0 | [Pins](../../package.json:12), [compiler configuration](../../tsconfig.json:2) |
| Persistence | LanceDB exactly 0.40.0; Arrow exactly 18.1.0 | [Manifest](../../package.json:13), [adapter](../../packages/storage-lance/src/index.ts:1) |
| Native packaging | Retain optional Windows/Linux native binaries at the exact pin; do not omit optional dependencies | [Appendix C](../OSG_MVP_SPEC.md:1239) |
| Core hashing | noble hashes 2.0.1 | [Manifest](../../package.json:15), [hash source](../../packages/core/src/hash.ts:1) |
| Parsing | Independently written TypeScript compiler API; explicitly experimental, not Approach A | [Provider](../../packages/indexing-kilo/src/index.ts:92), [target ingestion](../OSG_MVP_SPEC.md:609) |
| Tests | Built-in Node test runner over five suites; build first | [Scripts](../../package.json:7), [independent suite](../../tests/independent.test.mjs:54) |

The [lockfile](../../package-lock.json) retains optional Windows/Linux x64 native packages. Do not omit optional dependencies. No lint/docs-check script exists in the manifest. Hook configuration is untouched. WSL Ubuntu 24.04 was reported present without Node; Linux tests were not run. No dependencies vulnerability assessment has been completed.

The Linux prototype environment in [§18](../OSG_MVP_SPEC.md:846) is external historical evidence, not this workspace's runtime.
