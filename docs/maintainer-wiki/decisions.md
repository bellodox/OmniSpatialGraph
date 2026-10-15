# Documentation and Experiment Decisions

These are attributed scope/rationale records, not agent-created binding product decisions. [Specification decisions](../OSG_MVP_SPEC.md:126) and [human-only questions](../OSG_MVP_SPEC.md:153) retain authority. Later authorization does not retroactively approve earlier work or settle formal gates.

## 2026-10-13 — Documentation initialization

**Authorization:** The human requested entrypoints, wiki, local memory and ignore rules before implementation, then explicitly requested the root overview/changelog. This narrowly superseded the specification-only initialization restriction for those tasks, not Q7 generally, installation permission or G0 acceptance.

**Rationale:** Establish navigable requirements and distinguish planned design from implemented facts. Graph-based initialization was excluded because it contradicted the requested scope. Broad test-name ignore patterns required test-suite exceptions; the later wiki-ignore setting differed from initialization and was not silently restored. The wiki's durability never implied it was tracked or distributed.

**Subsequent status:** Historical multi-layer Carbon Memory procedures are superseded by the OSG-only policy below; they are not instructions to initialize or update a bank now.

## 2026-10-14 — Bounded standalone experiment

**Authorization:** The human permitted the standalone experiment's installs, builds, tests and continuation without intermediate pauses in the planned layout. Necessary documentation followed. This did not resolve Q1–Q9, accept G0–G6 or permit upstream copying.

**Choice and alternative:** An independently written TypeScript compiler API provider enabled the initial experiment without upstream adaptation. Non-Tree-sitter extraction was explicitly authorized as an **experimental deviation**, not a permanent replacement of specified Approach A. The present provider uses [Tree-sitter WASM](../../packages/indexing-kilo/src/treesitter.ts:34); that implementation is not formal Approach A or grammar-license acceptance.

**Retained constraints:** Integer-only canonical hashing, row-based append-only history, atomic head CAS, pure reads, adapter boundaries and runtime confinement. Lexical retrieval made the experiment useful without vectors, host integration, signing or future OpenSpeX emission. Broader platform/durability targets were not silently accepted when Windows checks passed.

## 2026-10-14 — OSG-only operational memory

**Authorization and choice:** Current human experimental authorization makes OSG the sole operational memory, irrespective of formal G5. Preserve the initialized store. The wiki remains human-facing architecture/rationale/runbooks, not a second task diary. Legacy-bank, NotebookLM and documentation-graph procedures are inactive.

**Rationale:** Retrieve code-linked evidence with bounded context and explicit provenance rather than copying every task into several documentation layers. Stored agent text remains hypothesis data, not instructions, identity or approval. Indexing headings/hashes does not preserve full document content and never independently authorizes deletion. See [memory policy](concept-carbon-memory.md).

**Artifact consequence:** Correct user instructions rather than preserving a stale README solely to avoid repack. The parent-owned refresh closed that README-only mismatch at its historical baseline; later changes require new artifact parity proof, not inherited approval ([record](../public-prototype.md#historical-packaged-baseline)).

## 2026-10-15 — Trust boundaries and explicit recovery

**Implementation rationale:** Editable derived caches cannot authorize state or source access. Reconstruct state from committed rows and reparse permitted source, accepting unbenchmarked extra work for correctness. Supersession checks on both write and read prevent persisted claims from acquiring authority over protected records. Current ignore/access policy also governs historical-context snippets. See [architecture](concept-architecture-overview.md).

**Human-authorized migration:** The existing repository store moved from format 1 to 2 without reinitialization, preserving identity, original rows/episodes and verified backup. The previous source-sync blocker is resolved; future migration, replacement restore and cache-fixing maintenance remain separately authorized operations with stopped-writer safeguards ([evidence](../public-prototype.md#repository-migration)).

**Documentation cleanup authorization:** The human requested removal of obsolete/irrelevant authored documentation while retaining agent entrypoints, overview, changelog, specifications and every wiki page. Consolidating completed task plans and superseded handoffs into current evidence/rationale avoids competing “current” blocks; deletion is based on redundancy, not indexing. Specifications, application files, runtime state and other harness files remain outside cleanup scope. This is not a legal decision or gate approval.
