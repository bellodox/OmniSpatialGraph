# OmniSpatialGraph — CLI-First, Integration-Ready Architecture and Development Plan

**Revision:** v0.5 · 2026-10-12  
**Product name:** OmniSpatialGraph  
**Primary invocation:** `osg` Node.js CLI (proposed executable name)  
**Primary licensing goal:** MIT-licensed original application code, with required notices for third-party dependencies and adapted source  
**Development environment:** Existing legacy Kilo Code orchestrator and agents  
**Persistence:** Embedded LanceDB, native table versions/commits  
**Rollout:** Approach A now → optional tight Kilo integration later → Approach B custom indexing later (either later step can be implemented independently)

## 0. Decision record: previous instructions superseded

- OmniSpatialGraph is **a standalone, cross-project Node.js/TypeScript application**, not a Kilo extension and not an MCP server.
- **For the first release, agents use terminal commands** (`osg ...`) through whichever terminal facility their host already provides. The app must not require a Kilo-specific agent tool or patch.
- **Internally, the CLI must be only a thin adapter to a stable importable library API.** This makes later tight Kilo integration an adapter-only project; Kilo can call the library directly via its native tool framework without spawning terminal commands.
- **Approach A** uses suitably MIT-licensed Kilo indexing source or algorithms to build OmniSpatialGraph's own embedded indexing provider. It does not require the Kilo extension or Kilo CLI at runtime.
- **Approach B** independently implements a replacement indexing provider behind the same interface. Do not rebuild the graph, history, persistence, query APIs or CLI when replacing the provider.
- The existing Kilo permissions are not bypassed. Agents without terminal access will require a permitted orchestrator-mediated read-only workflow until optional native integration is implemented. The CLI is not a sandbox or permission boundary.
- **No required HTTP daemon, MCP, external GraphRAG platform, separate Qdrant service, or VS Code dependency.** A foreground `osg watch` process is optional for live updates.

## 1. Design principle: ports and adapters, not three separate products

```text
NOW (CLI consumer)                       LATER (native Kilo consumer)
Kilo / any agent / human                 Kilo agent tool + host permissions
            |                                        |
       terminal: `osg`                     @omnispatialgraph/core API
            |                                        |
            +------------------+---------------------+
                               |
                 OmniSpatialGraph Application API
             query / sync / commit / history / merge
                               |
    +--------------------------+-----------------------------+
    |                          |                             |
Graph & Temporal Core    Ingestion Contracts         Retrieval & Context
identity / provenance   file events / AST facts     traversal / hybrid RAG
commit semantics        stable normalized output    evidence / revisions
    |                          ^                             |
    |                +---------+----------+                  |
    |                |                    |                  |
    |       IndexProvider A (now)   IndexProvider B (later)   |
    |       adapted MIT Kilo code   custom optimized code    |
    +--------------------------+-----------------------------+
                               |
                    LanceDB Storage Adapter
              authoritative graph + native commits
                rebuildable retrieval projection
```

**Five boundaries must remain explicit:** CLI transport, application API, ingestion providers, graph/temporal core, LanceDB persistence. Avoid cross-imports. The core never imports Kilo, `vscode`, terminal dispatch code or a specific Tree-sitter parser.

### Why this avoids rewrites

- **Later tight Kilo integration:** implement a Kilo host adapter that imports the same API used by `osg`. No graph migrations and no command semantics changes.
- **Later Approach B:** swap the indexing provider factory. Unchanged public API, stable graph identities, branch/commit history, and retrieval behavior.
- **Other projects:** use the `osg` CLI; Node.js applications may import the core API; other-language programs can parse documented JSON CLI output.

## 2. Packages and dependency rules

Proposed monorepo (`@omnispatialgraph/*` are names to be checked for npm availability; not claims of published packages):

```text
omnispatialgraph/
├── package.json                         # pnpm/npm workspace; Node.js LTS
├── LICENSE                              # MIT for original work
├── THIRD_PARTY_NOTICES.md
├── docs/
│   ├── architecture.md
│   ├── contracts.md
│   ├── commit-semantics.md
│   ├── migrations.md
│   ├── integration-kilo.md
│   └── adapters.md
├── packages/
│   ├── contracts/                       # Versioned JSON Schema + TS types
│   │   └── src/
│   ├── core/                            # Public API and domain logic
│   │   └── src/{api,graph,identity,temporal,commits,merge,retrieval}/
│   ├── storage-lance/                   # The only package importing LanceDB
│   │   └── src/
│   ├── indexing-kilo/                   # APPROACH A: own embedded provider
│   │   └── src/{discover,watch,parse,embeddings}/
│   ├── cli/                             # `osg` binary, no business logic
│   │   └── src/
│   ├── indexing-native/                 # APPROACH B, NOT NOW
│   └── integration-kilo/                # TIGHT KILO ADAPTER, NOT NOW
├── fixtures/
│   ├── code-project/
│   ├── branch-project/
│   └── spatial-temporal/
└── tests/{contract,storage,incremental,graph,history,cli,integration}/
```

Strict dependency direction:

1. `contracts` depends on no internal packages.
2. `core` depends on `contracts` and narrow adapter interfaces, not on `indexing-kilo`, `storage-lance`, `cli` or Kilo itself.
3. `storage-lance` implements core persistence ports; do not leak LanceDB handles or Arrow structures into public APIs.
4. `indexing-kilo` implements the ingestion ports using approved, attributed Kilo MIT code where useful. Its public exports must be host-independent; no `vscode`, Roo/Cline/Kilo extension state or platform-specific settings.
5. `cli` binds the application API, storage implementation and selected ingestion provider. It can be replaced or augmented by an SDK consumer without altering business logic.
6. Future `integration-kilo` is a **consumer** of the core API, not its host or owner; future `indexing-native` is a **provider** of ingestion contracts, not a replacement graph engine.

## 3. Freeze explicit interfaces at G0

The following are illustrative TypeScript interfaces to freeze or revise using contract tests before implementation:

```ts
export interface SourceChange {
  schemaVersion: 1;
  workspaceId: string;
  sourceId: string;             // stable across ingestion-provider changes
  path: string;                 // normalized workspace-relative POSIX path
  kind: 'add' | 'change' | 'delete' | 'rename';
  contentHash?: string;
  previousPath?: string;
  sourceGitRevision?: string;   // evidence, not graph commit identity
  observedAt: string;
}

export interface SourceFact {
  schemaVersion: 1;
  externalKey: string;          // provider-neutral qualified-symbol evidence
  kind: string;                 // function, file, import, call, decision, etc.
  properties: Record<string, unknown>;
  sourceRef: { path: string; startLine?: number; endLine?: number };
  confidence?: number;
}

export interface IndexingProvider {
  readonly id: string;
  readonly capabilities: ReadonlyArray<'scan'|'watch'|'extract'|'resolve'>;
  scan(workspace: WorkspaceContext): AsyncIterable<SourceChange>;
  watch?(workspace: WorkspaceContext): AsyncIterable<SourceChange>;
  extract(change: SourceChange, workspace: WorkspaceContext): Promise<SourceFact[]>;
}

export interface ProposedGraphDelta {
  schemaVersion: 1;
  workspaceId: string;
  expectedHead: string;         // optimistic concurrency guard
  sourceProvider: string;
  sourceBatchId: string;         // idempotency key
  assertions: GraphAssertion[];
  retractions: string[];
  evidenceRefs: string[];
}

export interface GraphCommit {
  id: string;
  parents: string[];
  branch: string;
  nativeLanceVersion: number;
  committedAt: string;
  sourceGitRevision?: string;
  deltaHash: string;
  actor: string;
}

export interface OmniSpatialGraph {
  sync(request?: { workspace?: string; branch?: string }): Promise<SyncResult>;
  query(request: GraphQuery): Promise<GraphQueryResult>;
  getEntity(id: string, options?: RevisionScope): Promise<GraphEntity | null>;
  history(request: HistoryRequest): Promise<HistoryResult>;
  diff(request: DiffRequest): Promise<GraphDiff>;
  propose(delta: ProposedGraphDelta): Promise<ProposalResult>;
  commit(proposalId: string, options?: { expectedHead?: string }): Promise<GraphCommit>;
  merge(request: MergeRequest): Promise<MergeResult>;
  close(): Promise<void>;
}
```

Additional requirements:

- JSON Schema and TypeScript types describe the **same data**. Public command results must include `schemaVersion`, `requestId`, `workspaceId`, `branch`, `graphCommitId`, `data`, and typed `error` when applicable.
- Separate **source fact extraction** from **stable entity identity resolution**. Do not identify a persistent function solely by file path, line number or search-chunk hash. Maintain continuity when lines are inserted and handle ambiguity on rename.
- Store evidence and truth status: observed source fact, agent hypothesis, approved decision, retracted fact, source owner policy. LLM suggestions must not silently acquire authoritative status.
- Model time as independent `validFrom`/`validTo`, `observedAt` and `committedAt`; optional spatial state has coordinates and reference frame, not mandatory positions for code symbols.
- Graph decisions can be ingested through proposed facts and accepted commits, not only by watching file changes.

## 4. CLI contract: stable across all future adapters

Proposed executable: `osg`. Full binary alias `omnispatialgraph` may be provided; existing `omni` commands should not be treated as a fixed public API until first release.

```bash
osg init --workspace .
osg scan --workspace . --json
osg sync --workspace . --json
osg watch --workspace .              # optional, foreground only
osg status --json
osg query "What depends on AuthService?" --branch main --json
osg context --entity symbol:AuthService --max-tokens 800 --json
osg graph neighbors symbol:AuthService --depth 2 --json
osg history --entity symbol:AuthService --json
osg diff --from G12 --to G13 --json
osg branch create docs-refactor --from G13 --json
osg branch merge docs-refactor --into main --json
osg propose --file proposed-graph-delta.json --json
osg commit --proposal P42 --expected-head G13 --json
osg doctor --json
```

CLI execution requirements:

- One-shot commands have no dependency on a persistent daemon. `watch` is entirely optional.
- CLI invokes the same application functions exported to native integrations; do not duplicate query, mutation, merge or identity logic in command handlers.
- Structured JSON to stdout; diagnostics to stderr; nonzero exit codes on failure; machine-readable errors for conflict, missing branch, stale head, invalid schema, history pruned, storage unavailable and unauthorized operation (where an actual trust boundary exists).
- Stable command names, option semantics, IDs and output shapes. A future Kilo adapter must not require consumers to learn a new query language.
- `--json` always includes source citations/provenance and graph version. Avoid dumping embeddings or internal LanceDB objects.
- Explicit project/workspace selection, normalized paths and configurable storage root; no implicit writes outside selected workspace.
- If the CLI is invoked by a Kilo agent, Kilo's terminal-tool permission is the permission boundary; a user-supplied `--mode documentation` flag is not proof of authorization.

## 5. LanceDB: commit model that survives Approach A, Approach B and Kilo integration

**Authoritative graph:** one LanceDB table for the MVP so that one validated mutation batch can be published with one Lance storage commit, independent of derived indexes. The exact storage shape (append-only graph events versus versioned materialized rows) is a G0 implementation choice; use comparative tests rather than assuming update/merge behavior is efficient.

Recommended first implementation if validated by the pinned SDK:

- One `graph_elements` table containing entities, edges and a semantic commit marker row in a single schema. Each accepted change set uses **one** `mergeInsert(...).execute(...)` transaction (or one append transaction if the event-row design benchmarks better).
- A central single-writer gate per workspace/branch and an `expectedHead` check prevent stale tool invocations from silently overwriting knowledge.
- Stable `GraphCommit.id` and its parent IDs describe the semantic history. Store the semantic commit marker in the same native mutation as its graph delta. Read the native version returned by or discovered after the transaction; rebuild the external lookup map after a crash.
- `nativeLanceVersion` is a storage revision, not sufficient by itself to describe semantic merge parents or provenance. The version-to-semantic-commit mapping must be auditable and recoverable.
- Historical queries must pin the correct graph table version/branch. Derived adjacency and vector indexes must include their `sourceGraphCommitId` and be rebuildable. A stale index cannot be authoritative evidence.
- Graph branches can exploit supported Lance table branching, but **semantic three-way conflict checks occur in OmniSpatialGraph**. Do not interpret Lance's branch diff/cherry-pick as complete graph-semantic merging.
- Disable unsafe automatic version pruning until history retention, pinning and backup strategy are proven. LanceDB optimization can prune historical versions; retention is not optional for historical graph requirements.
- Apply graph delta batching by meaningful change groups (not one Lance commit for every keystroke). Track source revision/worktree, coalesce noisy file watcher events and support `sync` on demand.
- Embedding failure, missing embedding provider or derived-index rebuild should not invalidate an already committed canonical graph state. Use lexical + graph retrieval fallback when vectors are unavailable.

**Early feasibility risk:** the installed `@lancedb/lancedb` version may not expose all documented branch features. G0 pins a real release, verifies native bindings on target Node versions and tests `listVersions`, `checkout`, `branches`, `mergeInsert`, crash recovery, two-process writes, pruning and worktree isolation. Branch feature fallback must preserve user-facing semantics or block the branch gate rather than silently downgrading them.

## 6. Approach A: source reuse, not runtime integration

1. Study and pin `Kilo-Org/kilocode`'s MIT `packages/kilo-indexing` files for scanner, cache, file watcher, Tree-sitter parser, embedder abstractions, LanceDB vector store and worktree overlay.
2. Reuse approved source directly where compatible, or adapt its algorithmic patterns. Keep attribution, license notices, source SHAs and a file-by-file provenance ledger. Do not ingest the old Apache-2.0 `kilocode-legacy` extension source into the MIT-only core.
3. Build `IndexingProviderA` as a **host-independent Node.js package** using the normalized `IndexingProvider` contract above. Do not require the Kilo harness at runtime, Kilo settings, plugin registry, or VS Code APIs.
4. Separate source discovery, parsing and embeddings. Graph ingestion must function without embeddings; vectors accelerate retrieval, not define graph validity.
5. Preserve source worktree/branch information and content hashes. Detect deletes and renames; reconcile across process restart. Confirm watchers are not relied upon as the sole source of truth: one-shot `sync` reconciles actual filesystem state.
6. Keep Qdrant/legacy `codebase_search` untouched in the user's installed Kilo environment for comparison; do not patch or migrate that harness in Approach A.
7. Port tests validating unchanged-file skipping, bounded batching, invalidation, cancellations, parser language fallbacks and SHA-256 hashes. Add new tests for stable semantic identity, relationship retractions and native Lance graph commits.

Approach A is done when another non-Kilo Node.js project can invoke `osg scan`, `osg query`, `osg history` and `osg diff` without Kilo installed.

## 7. Future tight Kilo integration: adapter only

Build an optional `integration-kilo` adapter **after** the CLI and core are stable:

- Host-side Kilo tool registration exposes appropriate read-only `query/history/context` operations and separately authorized `propose/commit/merge` operations through the existing agent tool-dispatch mechanism.
- Tool callbacks import `@omnispatialgraph/core` and call the **same public API** as the CLI. No CLI subprocess or MCP is necessary for tight integration.
- Optionally subscribe to Kilo's native source-indexing events through `IndexingProvider` rather than running a duplicate watcher. If host event compatibility is limited, keep the autonomous provider enabled and use native Kilo only for retrieval.
- Mode-specific permissions are enforced in the Kilo host. The original legacy `groups`/`fileRegex` restrictions must remain intact. An unconstrained shell already available to an agent remains a separate security consideration; the graph API cannot retroactively sandbox it.
- Kilo integration must not import or modify OmniSpatialGraph storage/commit internals. Test direct library invocation and CLI invocation against the **same graph data** (not concurrently unless locking tests pass).
- Publish this adapter under its own licensing and third-party attribution requirements; the MIT core remains independent. Do not relabel modified Apache-2.0 legacy host files as solely MIT.

**Definition of success:** after adding the Kilo adapter, `osg query ...` and a native Kilo graph-query tool return equivalent revision-scoped results and citations; either client can be removed without corrupting the graph.

## 8. Approach B: replace the indexing provider, preserve everything else

Implement `IndexingProviderB` from native OmniSpatialGraph code with the same source-change/fact contracts:

- Optimized hash inventory and platform-aware filesystem watcher.
- AST incremental reparsing, Tree-sitter query improvements and TypeScript language-service-based symbol/reference resolution where applicable.
- Fine-grained dependency invalidation (function/symbol-level, not only file-level), rename detection and source-identity continuity.
- Embedding minimization (only changed relevant chunks) and asynchronous vector projection.
- Worktree overlay and branch-aware input differences.
- More languages and domain adapters beyond code: documentation, websites, event streams, physical observations and restrictions.

**Migration rule:** a previously indexed workspace must open with B enabled without a full graph rewrite, change of entity IDs or reset of LanceDB commit history. A one-time consistency scan is allowed; destructive reindexing is not. Demonstrate the same CLI and API tests using both providers, then compare correctness and performance.

## 9. OpenSpeX and universality

- OmniSpatialGraph models knowledge, observed and inferred facts, relationships, optional geometry, policy descriptions, source provenance and temporal evolution.
- OpenSpeX defines interoperable applicability/scope for restrictions; consuming applications enforce them using their own native permission/execution systems. Do not build a mandatory centralized OpenSpeX enforcement engine into the CLI.
- The first MVP is a repository-memory use case, not a permanently code-specific graph design. Keep type/kind vocabularies extensible and support a synthetic moving-object `(x,y,z,t)` fixture.
- Reserved extension points: JSON-LD/RDF interchange, multimodal observation adapters, agent decision episodes, community retrieval, specialized spatial indexing. These are not prerequisites for basic CLI operation but the data model must not prevent them.

## 10. Build gates and owners

| Gate | Owner (existing Kilo mode, subject to permissions) | Deliverable | Acceptance |
| --- | --- | --- | --- |
| G0: Architecture and feasibility | Orchestrator + Research + Storage + Review | pinned sources/licenses, Lance branch/commit tests, v1 JSON/API contracts, benchmarks plan | pinned SDK works on Node target; one graph batch maps to one native commit; clear split A/B and Kilo host |
| G1: Core + contracts | Schema/Core + Storage | stable IDs, evidence, temporal model, Lance adapter, graph operations, CLI skeleton | library test and `osg init/status` pass with no Kilo installed |
| G2: Approach A indexing | Ingestion | Kilo-derived autonomous Node scanner/parser/watcher provider | `osg sync` creates minimal graph mutations, survives restart |
| G3: Lance history and branching | Storage + Graph | semantic commits, historical views, branch diff, merge conflicts | prior versions reconstruct and two branches merge/reject as expected |
| G4: GraphRAG | Retrieval | hybrid seeds, bounded traversals, evidence, context budget | changed code affects correct downstream retrieval; source citations show commit |
| G5: Agent CLI contract | CLI + Test | JSON output, exit codes, one-shot commands, docs, npm packaging | any terminal-capable harness can use it without Kilo code changes |
| G6: Universality and security | Review + Test | spatial/temporal fixture, provenance rules, mode permission analysis | graph supports physical `x,y,z,t`; source truth separated from claims |
| G7: Future Kilo adapter (NOT NOW) | Integration | native tool host adapter | same graph results as CLI without spawning CLI |
| G8: Approach B (NOT NOW) | Ingestion | new provider implementing v1 contract | B reuses persisted graph and passes provider-neutral acceptance suite |

Orchestrator must inspect installed legacy modes/permissions and use existing Kilo role names rather than assume a new harness. No implementation work is delegated to modes whose native write permissions prohibit it.

## 11. Essential regression/acceptance tests

1. **Standalone:** install and run Node.js CLI without Kilo or VS Code; `osg --help`, `init`, `scan`, `query`, `history` work.
2. **Stable entity identity:** insert ten lines above a function; entity ID remains the same, location updates.
3. **Incremental update:** modify one function; only affected graph facts and indexes are updated; unrelated entity/edge histories unchanged.
4. **Native commit:** one accepted atomic batch yields a documented semantic commit and recoverable Lance version; no partial state after crash/restart.
5. **Concurrent callers:** two independent processes with stale heads cannot silently overwrite or duplicate facts.
6. **Time travel:** query at graph commit G1 reproduces old relationship while G2 shows its replacement after restart.
7. **Branching:** distinct branches do not contaminate each other; compatible facts merge; exclusive facts conflict.
8. **Source versus inferred knowledge:** source extraction is traceable; LLM suggestions cannot silently supersede source-owner rules.
9. **GraphRAG:** semantic seed + graph traversal finds non-obvious dependencies and evidence; retrieval degrades gracefully if embeddings unavailable.
10. **Packaging/license:** MIT source package can be used commercially in an unrelated repository; notices included for bundled/dependent MIT/Apache components, no unapproved noncommercial source copied.
11. **4D:** a moving object can be queried at two `(x,y,z,t)` states without making repository nodes spatial.
12. **Future compatibility:** API/CLI golden tests are reused unchanged by a simulated native Kilo adapter and a dummy `IndexingProviderB`.
13. **Migration:** swapping A to B preserves entity IDs, semantic commits, prior Lance versions and graph-query results.
14. **Retention:** historical versions required by commits are not pruned during `optimize` or maintenance; missing-version error is detectable.
15. **Security:** future native Kilo permissions apply in host dispatcher; the CLI itself does not pretend to enforce caller identity derived from flags.

## 12. Orchestrator kickoff instruction

> Build **OmniSpatialGraph**, an independent MIT-licensed Node.js/TypeScript CLI-first universal, incremental 4D GraphRAG engine using LanceDB-native graph commits. The executable is proposed as `osg`. Its CLI handlers MUST call a stable, importable TypeScript `OmniSpatialGraph` application API. Implement **Approach A now** as a Kilo-derived, host-independent indexing provider using approved MIT code/patterns from the current `Kilo-Org/kilocode` standalone indexing package. Do not integrate with or patch the installed Kilo harness in this phase. Agents use CLI terminal commands. Implement versioned ingestion contracts so a future custom **Approach B** provider can replace A without touching canonical graph data, commits, query API, command syntax or history. Implement the optional future **tight Kilo integration** through native Kilo tool registration and direct import of the same core API, with no CLI subprocess or MCP; do not build this adapter yet. Keep all Kilo-specific code outside core. Complete G0 feasibility/license/API research and tests first, then report findings and seek the existing human acceptance gate before G1. Preserve native Kilo mode restrictions throughout.

## 13. Primary research material and verification status

- `https://github.com/Kilo-Org/kilocode/tree/main/packages/kilo-indexing` — current Kilo MIT standalone indexing package; inspect and pin exact upstream revision before source reuse.
- `https://github.com/Kilo-Org/kilocode-legacy/tree/main/src/services/code-index` — legacy Kilo scanner/Tree-sitter and native permissions integration **research reference only**, licensed Apache-2.0.
- `https://lancedb.github.io/lancedb/js/classes/Table/` — SDK `add`, `mergeInsert`, `listVersions`, `checkout`, `branches`, `optimize`.
- `https://lancedb.github.io/lancedb/js/classes/Branches/` — branch `create`, `checkout`, `diff`, `cherryPick` APIs (not graph-semantic conflict detection).
- `https://lancedb.github.io/lancedb/js/interfaces/OptimizeOptions/` — history-pruning behavior.
- `https://github.com/getzep/graphiti` — temporal entity/edge reconciliation reference.
- `https://github.com/terminusdb/terminusdb` — semantic graph revision, branch and diff design reference.
- `https://github.com/microsoft/graphrag` — GraphRAG community/retrieval design reference.

This document is a **development specification**, not evidence that the integrated implementation has been built, runtime benchmarked or passed acceptance tests. Exact SDK features and license obligations must be confirmed against pinned release artifacts at G0.
