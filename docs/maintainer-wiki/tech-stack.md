# Technology Inventory

Declared dependencies are source facts; tested execution is separately attributed in the [handoff](../public-prototype.md#evidence).

| Area | Current checkout fact | Evidence |
| --- | --- | --- |
| Runtime | Node 22/24 LTS; recorded Windows x64 Node 24.14.1/npm 11.11.0 | [Engines](../../package.json:7) |
| Package/API | Private 0.1.0-prototype.0, Apache-2.0 metadata; public worker bin and five typed exports | [Manifest](../../package.json:2) |
| Build | TypeScript 5.9.3, Node types 24.10.0; strict NodeNext compiled output | [Pins](../../package.json:32), [compiler configuration](../../tsconfig.json:2) |
| Persistence | LanceDB 0.40.0 and Arrow 18.1.0 | [Manifest](../../package.json:33), [adapter](../../packages/storage-lance/src/index.ts:1) |
| Hashing/ignore | noble hashes 2.0.1; ignore 7.0.12 | [Pins](../../package.json:35) |
| Parsing | Tree-sitter WASM 0.3.1 plus tree-sitter-wasms 0.1.13; fourteen languages, isolated Swift compilation | [Pins](../../package.json:36), [grammar map](../../packages/indexing-kilo/src/treesitter.ts:34) |
| Retrieval | Weighted lexical ranking, typed two-hop expansion, episode reservation; no embeddings | [Implementation](../../packages/core/src/retrieval.ts:69) |
| Runtime format | Format 2; explicit migration and verified backup/restore | [CLI](../../packages/cli/src/index.ts:529), [migration evidence](../public-prototype.md#repository-migration) |
| Tests | Built-in Node test runner; build before tests | [Scripts](../../package.json:26), [attributed latest proof](../public-prototype.md#evidence) |
| Native/dependency limits | Bundled Sharp 0.35.5 conflicts with Transformers 3.0.2's declared range; images/embeddings disabled. Seven Lance optional-platform declarations are not seven bundled Lance binaries | [Manifest conditions](../../package.json:20) |

Install with lifecycle scripts disabled and optional natives retained; deliberate build/prepack remains explicit. No lint/docs-check or prototype-pack alias is configured. The historical Windows archive is platform-built and not proof of current parity or Linux/macOS execution. Audit success does not resolve compatibility, grammar/native-LGPL obligations or frozen-spec MIT versus Apache checkout licensing; see [human decisions](open-work.md#human-decisions).

The Linux environment in [specification §18](../OSG_MVP_SPEC.md:846) is external historical prototype evidence, not this workspace's execution proof.
