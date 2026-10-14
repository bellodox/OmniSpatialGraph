# Technology Inventory

Manifest/lock facts and reported execution are distinguished below. See the [current handoff](../public-prototype.md) for provenance, commands and final scoped reviews.

| Area | Experiment fact / target distinction | Evidence |
| --- | --- | --- |
| Runtime | Node 22/24 LTS; Windows x64 tested on 24.14.1 | [Manifest](../../package.json:7), [recorded proof](../public-prototype.md:32) |
| Package/API | One private/UNLICENSED 0.1.0-prototype.0 package; public worker bin, five exports/types | [Manifest](../../package.json:2) |
| Language/build | TypeScript 5.9.3; strict NodeNext compilation to dist; Node types 24.10.0 | [Pins](../../package.json:32), [compiler configuration](../../tsconfig.json:2) |
| Persistence | LanceDB exactly 0.40.0; Arrow exactly 18.1.0 | [Manifest](../../package.json:33), [adapter](../../packages/storage-lance/src/index.ts:1) |
| Native packaging | Seven Lance optional-platform declarations retained; archive physically contains Windows x64 Lance only, not seven binaries | [Manifest conditions](../../package.json:23), [archive assertions](../../tools/consumer-proof.mjs:72) |
| Hashing/ignore/images | noble hashes 2.0.1, ignore 7.0.12, bundled Sharp 0.35.5; images/embeddings disabled | [Pins/override](../../package.json:32), [hash source](../../packages/core/src/hash.ts:1) |
| Parsing | Independently written TypeScript compiler API; explicitly experimental, not Approach A | [Provider](../../packages/indexing-kilo/src/index.ts:92), [target ingestion](../OSG_MVP_SPEC.md:609) |
| Tests | Built-in Node test runner over nine suites; build first; recorded full 44 pass/0 fail/0 skip | [Scripts](../../package.json:26), [proof](../public-prototype.md:32) |

Install with lifecycle scripts disabled and optional natives retained. No lint/docs-check or prototype-pack alias exists. Recorded root/fresh/retained-consumer audits found zero registry vulnerabilities, resolving the former Sharp version-specific findings, not all security risk. Dependency-tree checks still exit 1/ELSPROBLEMS: Transformers 3.0.2 requires Sharp ^0.33.5, excluding bundled 0.35.5. Final security evidence includes 112 signatures/14 attestations, not compatibility or license clearance. Independent clean Windows install/types/bin/API/native evidence exists; Linux/macOS and native/LGPL redistribution closure remain unverified. Hook configuration is untouched ([evidence/conditions](../public-prototype.md:50)).

The Linux prototype environment in [§18](../OSG_MVP_SPEC.md:846) is external historical evidence, not this workspace's runtime.
