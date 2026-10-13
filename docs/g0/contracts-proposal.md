# G0 v1 contracts and gated G1 proposal

## Candidate status and source mapping

**Proposed, not accepted, frozen, compiled or implemented.** Examples are conceptual documentation, not machine-validated schema artifacts or production files. Final readiness/security/review dispositions are complete for human G0 review only; G1 remains blocked/unstarted pending explicit human acceptance and separate authorization. The [storage dossier](architecture-feasibility.md) validates an isolated fixture, not this universal model. Preserve [v0.5](../OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:104) and the overriding [concept scope](../OmniSpatialGraph_Concept_Test_Scope.md:15).

| Requirement | Candidate response | Future proof |
| --- | --- | --- |
| [Universal kinds/provenance/time](../OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:173) | Six element categories; extensible kinds/JSON attributes; independent truth, lifecycle and times | Schema/type parity and cross-field tests |
| [Identity before G1](../OmniSpatialGraph_Concept_Test_Scope.md:16) | Workspace/domain + qualified name + kind + disambiguator | Determinism, line insertion, overload and ambiguity cases |
| [Marker correction](../OmniSpatialGraph_Concept_Test_Scope.md:15) | Atomic rows/marker; native version discovered after publication | Adapter reopen/mapping recovery |
| [Plain rows/branch DAG](../OmniSpatialGraph_Concept_Test_Scope.md:24) | Pinned resolved snapshots, target materialization, conflict rejection | G3, not measured here |
| [Thin API/CLI](../OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:95) | Core injection of narrow contracts only; separate consumer composition | Direct-library/CLI parity |
| [Stable envelope](../OmniSpatialGraph_Architecture_Development_Plan_v0.5.md:175) | Required top-level scope and discriminated result/error | Schema parity, streams and exit codes |
| [Replaceable provider](../OmniSpatialGraph_Concept_Test_Scope.md:27) | Version/capability negotiation, provider-neutral facts, core-owned IDs | Contract specifications now; B/migration proof deferred |

## Universal v1 field tables

All public records have schema version exactly 1. Closed top-level objects reject unknown fields; explicit attributes maps admit recursively finite JSON values (including null), not undefined/functions/NaN. Strings representing IDs are core-owned opaque references; no SDK/Arrow values cross the API. Input optional fields may be omitted; normalized outputs contain the corresponding required nullable fields. Never treat omitted and null as interchangeable without that normalization rule.

| Record | Required fields and types | Optional input / required nullable normalized output |
| --- | --- | --- |
| Entity | schemaVersion:1; elementType:entity; id, workspaceId, namespace, kind, qualifiedName, disambiguator:string; attributes:JSON map; state:active or tombstone; truthStatus:observed, hypothesis, decision or policy; evidenceIds:string[]; observedAt, committedAt:UTC time | validFrom, validTo:UTC time or null; spatial:frame plus coordinates and optional at, or null |
| Relation | Common entity metadata except qualified name; elementType:relation; subjectId, objectId, kind, disambiguator:string; attributes:JSON map | Same time/spatial rules |
| Assertion | Common provenance/time/lifecycle metadata; elementType:assertion; subjectId, predicate:string; cardinality:functional or multivalued; disambiguator:string; value:JsonValue | Same time rules; value is required and may itself be JSON null |
| Evidence | schemaVersion:1; elementType:evidence; id, workspaceId, sourceId, actor, providerId, providerVersion:string; observedAt:UTC; confidence:number 0..1 | location:{locator,startLine,endLine} or null; contentHash, chunkHash, sourceGitRevision, worktree:string or null |
| Source | schemaVersion:1; elementType:source; id, workspaceId, namespace, locator, kind:string; state; attributes; observedAt, committedAt:UTC | contentHash, sourceGitRevision, worktree:string or null |
| Commit marker | schemaVersion:1; elementType:commit; id, workspaceId, branch, deltaHash, actor, committedAt, idempotencyKey:string; parents:string[] | No native version field; source revision may be null in normalized output |

Truth status is independent of active/tombstone lifecycle. Retraction does not turn an observation into a hypothesis. Hypotheses must not silently supersede source-owner policy or approved decisions. Actors/provider/location/hashes/confidence preserve provenance, not authorization. Source-owner policy is data; enforcement belongs to an actual consumer trust boundary.

Time strings are normalized UTC with a trailing Z. Valid intervals are end-exclusive; when both endpoints exist, validFrom < validTo. Unknown/open endpoints normalize to null. observedAt and committedAt remain distinct: late-arriving observations and future-valid policy must not be rejected by assuming valid time equals transaction time. Commit time follows the publication sequence; clock skew between provider observation and core commit is surfaced, not silently corrected. Evidence locations use one-based inclusive line bounds; both line endpoints are present together and startLine <= endLine. Relation endpoints/evidence/source references must resolve in the batch or selected snapshot. Tombstones keep references/provenance for history but hide active facts.

Optional spatial state has a declared reference frame and finite coordinate numbers; optional at is valid-time evidence. Schema extensibility does not prove a moving-object/G6 fixture; that runtime proof is deferred.

## Identity candidate and ambiguity policy

Core computes canonical identity from a structured tuple: version, logical workspace, domain namespace, qualified name, kind, disambiguator. Normalize each string to Unicode NFC; encode components unambiguously as UTF-8 bytes with byte lengths (or a specified canonical JSON-array encoding in the future identity test). Candidate presentation: prefix osg:v1/ followed by base64url of the UTF-8 canonical JSON array `[workspaceId, namespace, qualifiedName, kind, disambiguator]`, without padding. The encoded array uses compact JSON escaping and NFC strings; do not join arbitrary names with ambiguous separators. This is a candidate algorithm, not a frozen package API.

For code, qualifiedName is itself a compact JSON encoding of `[normalizedWorkspaceRelativePOSIXModulePath, structuredLexicalSymbolSegments]`, e.g. `["src/math.ts",["Calculator","sum"]]`. Reject absolute paths/traversal for workspace-relative locators. Signatures provide overload disambiguators (normalized parameter/type structure); unique non-overloaded declarations use an explicit empty disambiguator. Do not assign encounter-order ordinals that silently swap identities. Ambiguous anonymous/same-name candidates are rejected or flagged low-confidence for resolution, never silently assigned stable IDs. Non-code names use a documented domain namespace and qualified naming tuple, e.g. a catalog/object name, not a forced code path.

Logical names are case-sensitive even on Windows. Filesystem aliases/case-collisions are a separate locator-resolution error; do not collapse logical names through Windows case folding. Workspace ID is logical, not the machine's absolute checkout path. Provider-specific IDs, line numbers, chunk hashes and file content hashes are not canonical identity components. Providers emit locators and symbol evidence; core owns source IDs and graph IDs.

| Desk-check case | Expected candidate result |
| --- | --- |
| Insert ten lines above unchanged named function | Same qualified name/kind/signature → same ID; evidence location changes |
| Two overloads of the same function | Different structured signatures → different disambiguators/IDs |
| Duplicate unresolved declarations with indistinguishable signatures | Ambiguity error/low-confidence resolution queue, not position-based ordinals |
| NFC-equivalent names | Same normalized identity |
| Same symbol in two logical workspaces/domains | Different IDs |
| File/symbol rename | Continuity unresolved pending human choice; new ID plus explicit renamedTo is possible, not guaranteed continuity |
| Provider changes its chunk IDs | Canonical graph identity unchanged |

Reject **provider-assigned canonical-ID fields**, not arbitrary occurrences of osg:v1/ in documentation/source content. Provider-local same-batch references are permitted and must be distinguished from durable IDs. A rename can only produce a continuity mapping under an explicitly approved core policy; guessing from content similarity alone is not acceptance.

## Conceptual TypeScript and JSON Schema examples

These examples correspond to the complete small evidence contract; other record tables above specify the proposed family. The future universal schemas must cover all six categories, not merely these representatives. Refer to [this proposal](contracts-proposal.md:1) for all conceptual declarations below; no production type files exist.

```typescript
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface EvidenceV1 {
  schemaVersion: 1;
  elementType: 'evidence';
  id: string; workspaceId: string; sourceId: string;
  actor: string; providerId: string; providerVersion: string;
  observedAt: string; confidence: number;
  location: { locator: string; startLine: number; endLine: number } | null;
  contentHash: string | null; chunkHash: string | null;
  sourceGitRevision: string | null; worktree: string | null;
}
export interface CommitMarkerV1 {
  schemaVersion: 1; elementType: 'commit';
  id: string; workspaceId: string; branch: string; parents: string[];
  deltaHash: string; actor: string; committedAt: string; idempotencyKey: string;
  sourceGitRevision: string | null;
}
```

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EvidenceV1 candidate",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "elementType", "id", "workspaceId", "sourceId", "actor", "providerId", "providerVersion", "observedAt", "confidence", "location", "contentHash", "chunkHash", "sourceGitRevision", "worktree"],
  "properties": {
    "schemaVersion": {"const": 1},
    "elementType": {"const": "evidence"},
    "id": {"type": "string", "minLength": 1},
    "workspaceId": {"type": "string", "minLength": 1},
    "sourceId": {"type": "string", "minLength": 1},
    "actor": {"type": "string", "minLength": 1},
    "providerId": {"type": "string", "minLength": 1},
    "providerVersion": {"type": "string", "minLength": 1},
    "observedAt": {"type": "string", "format": "date-time", "pattern": "Z$"},
    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    "location": {"oneOf": [
      {"type": "null"},
      {"type": "object", "additionalProperties": false, "required": ["locator", "startLine", "endLine"], "properties": {
        "locator": {"type": "string", "minLength": 1},
        "startLine": {"type": "integer", "minimum": 1},
        "endLine": {"type": "integer", "minimum": 1}
      }}
    ]},
    "contentHash": {"type": ["string", "null"]},
    "chunkHash": {"type": ["string", "null"]},
    "sourceGitRevision": {"type": ["string", "null"]},
    "worktree": {"type": ["string", "null"]}
  }
}
```

Matching normalized evidence JSON (opaque illustrative IDs are not computed identity vectors):

```json
{"schemaVersion":1,"elementType":"evidence","id":"ev-example","workspaceId":"demo","sourceId":"source-example","actor":"scanner","providerId":"approach-a","providerVersion":"1","observedAt":"2026-10-13T12:00:00Z","confidence":1,"location":{"locator":"src/math.ts","startLine":10,"endLine":12},"contentHash":"sha256:example","chunkHash":null,"sourceGitRevision":null,"worktree":"main"}
```

Complete marker representative schema and matching JSON:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CommitMarkerV1 candidate", "type": "object", "additionalProperties": false,
  "required": ["schemaVersion", "elementType", "id", "workspaceId", "branch", "parents", "deltaHash", "actor", "committedAt", "idempotencyKey", "sourceGitRevision"],
  "properties": {
    "schemaVersion": {"const": 1}, "elementType": {"const": "commit"},
    "id": {"type": "string", "minLength": 1}, "workspaceId": {"type": "string", "minLength": 1},
    "branch": {"type": "string", "minLength": 1},
    "parents": {"type": "array", "uniqueItems": true, "items": {"type": "string", "minLength": 1}},
    "deltaHash": {"type": "string", "minLength": 1}, "actor": {"type": "string", "minLength": 1},
    "committedAt": {"type": "string", "format": "date-time", "pattern": "Z$"},
    "idempotencyKey": {"type": "string", "minLength": 1}, "sourceGitRevision": {"type": ["string", "null"]}
  }
}
```

```json
{"schemaVersion":1,"elementType":"commit","id":"G2","workspaceId":"demo","branch":"main","parents":["G1"],"deltaHash":"sha256:example","actor":"human","committedAt":"2026-10-13T12:01:00Z","idempotencyKey":"batch-example","sourceGitRevision":null}
```

Cross-field rules (line order, interval order, DAG cycles, reference resolution, ID encoding, canonical JSON/delta hash and actual date validation) require semantic validators in addition to JSON Schema. Draft 2020-12 format annotation alone is not guaranteed enforcement. Future parity tests must exercise JSON validation and TypeScript compile-time fixtures against identical valid/invalid cases. JSON numbers must be finite; canonical body/hash serialization must specify object-key order and number encoding before implementation.

| Worked case | Expected validation |
| --- | --- |
| Entity kind function, named qualified tuple, observed, active, validTo null, evidence array | Valid shape; ID/references must pass semantic checks |
| Relation calls with resolvable subject/object and evidence lines 10..12 | Valid; missing endpoint is invalid or explicitly unresolved provider input, never a dangling committed relation |
| Hypothesis with confidence 0.4 and separate actor evidence | Valid hypothesis, not approved decision |
| Assertion value null, functional cardinality and empty disambiguator | Valid; missing value invalid |
| Marker with nativeVersion/nativeLanceVersion | Invalid durable marker field |
| Evidence startLine 0, endLine < startLine, confidence 1.2 or non-UTC time | Invalid |
| validFrom equal to/after validTo | Invalid interval |
| Unknown top-level property versus custom attributes entry | Invalid top-level; valid JSON attributes extension |

## Provider input, replacement and idempotency

| Contract | Concrete proposed fields / obligations |
| --- | --- |
| SourceChange | schemaVersion:1; workspaceId; providerVersion; kind:add/change/delete/rename; locator; observedAt; optional previousLocator (required on rename), contentHash, sourceGitRevision, worktree. Core resolves sourceId; providers do not assign it. |
| SymbolEvidence | modulePath:normalized POSIX string; lexicalSegments:string[]; kind:string; signature:structured JSON or null; confidence:0..1. No line-number identity. |
| SourceFact entity variant | schemaVersion:1; factType:entity; localRef:string; sourceLocator:string; symbol:SymbolEvidence; attributes:JSON map; evidence:input evidence[] |
| SourceFact relation variant | schemaVersion:1; factType:relation; localRef; sourceLocator; kind; subject/object:Endpoint; disambiguator; evidence[]; attributes |
| SourceFact assertion variant | schemaVersion:1; factType:assertion; localRef; sourceLocator; subject:Endpoint; predicate; value:JsonValue; cardinality; disambiguator; truthStatus; evidence[] |
| Endpoint | Discriminated sameBatch:{localRef}, external:{locator,symbol}, or unresolved:{reason,candidates}. External uses normalized locator plus symbol evidence, not provider canonical ID. |
| ProposedGraphDelta | schemaVersion:1; workspaceId; branch; expectedHead:string or null; core-owned sourceBatchId/idempotencyKey; sourceProvider/version; assertions:normalized elements[]; retractions:row keys[]; evidenceRefs:string[]; sourceReplacements:{sourceId,previousFactKeys,nextFactKeys}[] |
| IndexingProvider | id:string; version:string; schemaVersions:number[]; capabilities:scan/watch/extract/resolve; scan async changes; optional watch async changes; extract returns discriminated facts; optional resolve endpoints. Negotiate version/capabilities before use; unsupported combinations return typed errors. |

Extraction batch-local keys are not durable IDs. Core normalization closes top-level shapes, assigns source/element IDs, resolves endpoints and validates source ownership. Unresolved endpoints are retained as evidence/candidates or cause rejection; they never silently become definitive edges. Functional assertion key is subject+predicate; multivalued assertion key additionally includes an explicit semantic disambiguator. Different values for a functional key conflict; multivalued facts must not collide through omitted disambiguators.

A changed file requires full source-scoped reconciliation of previous versus newly extracted facts, **not only delete-event handling**. Removed functions/relations/assertions from a changed file are retracted atomically with replacements/evidence. Delete retracts that source's contributions; shared facts supported by other sources must retain their other provenance. Rename updates locators and requires the unresolved continuity policy, not silent delete/add identity reassignment. Watchers are hints; one-shot scan reconciles actual current state.

Content hash is a fingerprint, **not a durable global idempotency key**. A→B→A must publish the return to A at its new expected head. Core batch identity includes workspace, branch, expected head and canonical normalized delta; retries of the same proposal reuse the same identity. Check a matching published marker before stale-head rejection for a retry whose publication was acknowledged late; same key with different payload is conflict. An unrelated later A observation cannot be skipped merely because A appeared earlier.

Provider-neutral C-tests are specifications only: path/NFC normalization, deterministic extraction order, line insertion identity, deletes and changed-file removed-fact retractions, rename ambiguity, same-batch/external/unresolved endpoints, schema negotiation, provider-neutral canonical IDs, cancellation and A→B→A correctness. No provider B or migration proof is implemented; those are deferred.

## Storage, semantic mapping and exact snapshots

Candidate single table graph_elements contains plain versioned rows for all element types. Composite publication key is rowKey+branch, with schemaVersion, elementType, id, subjectId/objectId/sourceId (nullable where inapplicable), state, commitId and canonical JSON body. Validate key uniqueness **before** publication. One atomic merge publishes every changed row/tombstone plus commit marker. Never publish completion in a separate metadata table. Durable marker contains parents/deltaHash/actor/committedAt/idempotencyKey but **no native version**. After publication resolve its version; the returned commit result may include nativeVersion metadata.

Mapping recovery enumerates retained native versions and derives the **earliest version in which each marker appears**; later versions retaining that marker are not its publication version. Mapping cache is rebuildable and not authoritative. Missing required native version returns typed history-unavailable/storage error, not a silently current snapshot. Marker identity is immutable; repeated semantic commit IDs with inconsistent contents fail recovery. No optimization/cleanup. Back up closed table directories; restoration proof remains future work. Minimal policy is documented single writer; a lock is optional and no automatic stale-PID deletion safety is promised.

Branch creation records a fork commit and pins that parent's resolved state. Read the selected commit's native snapshot, then resolve branch-local rows/tombstones over pinned first-parent lineages. First parent preserves the target lineage at merges; the second parent records source ancestry. Merged accepted facts are **materialized on the target branch** in the atomic merge; do not dynamically inherit arbitrary second-parent live state. Tombstones hide inherited facts. Never read today's parent branch for an old fork.

Diff compares **complete resolved snapshots**, including inherited rows and tombstones, at both exact requested commits; a row's latest commitId interval is insufficient. History traverses first-parent states for branch-local progression and explicit ancestry for provenance, comparing exact resolved states; do not assume a single linear branch or use native version order as semantic ancestry.

Merge compares resolved target/source snapshots against their unique common base. Identical changes are compatible; distinct-key compatible facts combine; incompatible same-key changes (including change/delete or functional assertion value conflicts) reject the **whole batch**. Multiple merge bases are explicitly unsupported/rejected, not guessed. Reference integrity is rechecked after merge. These are proposed G3 semantics, not measured branch guarantees. Rebuildable vector/adjacency projections carry sourceGraphCommitId and cannot supersede canonical snapshots.

## API, composition and envelope candidate

Proposed factory createOmniSpatialGraph receives injected persistence, ingestion, clock/identity and diagnostic ports defined in contracts. Core imports contracts only, never concrete storage/indexing/CLI adapters; Lance/Arrow handles stay in storage. CLI composition binds concrete adapters and calls the same API; a direct consumer has a separate composition path. Future host integration consumes that API and preserves native host authorization, without an MCP server, mandatory daemon or core rewrite.

| API operation | Request/result intent; planned availability |
| --- | --- |
| init / status | Selected workspace/storage/branch; typed InitResult/StatusResult, G1 vertical slice |
| sync | Versioned source reconciliation → SyncResult; G2 |
| query / context / getEntity | Revision-scoped retrieval/budget/entity → typed results; later graph/G4 work |
| history / diff | Exact semantic revision scopes → HistoryResult/GraphDiff; G3 |
| propose / commit | Validated delta/expected head → ProposalResult/GraphCommitResult; incremental core work |
| branch / merge | Fork scope or source/target heads → BranchResult/MergeResult; G3 |
| doctor | Capabilities/storage/limitations diagnostics → DoctorResult; later scoped diagnostics |
| close | Release injected resources → typed completion result; G1 |

All operations return typed results; reserved but unsupported operations return minimum typed UNSUPPORTED_OPERATION errors and an explicit status limitation, never fake success/stubs. Details of each later operation remain candidate work. No claim that this reserved full API exists now.

Conceptual envelope types, with required v0.5 fields remaining **top-level**:

```typescript
export interface EnvelopeScope {
  schemaVersion: 1; requestId: string;
  workspaceId: string | null; branch: string | null; graphCommitId: string | null;
  warnings: { code: string; message: string }[];
  metadata: { nativeVersion: number | null };
}
export interface ApiError {
  code: string; category: 'internal' | 'invalid' | 'notFound' | 'conflict' | 'storage' | 'provider';
  message: string; details: JsonValue; retryable: boolean;
}
export type Result<T> = EnvelopeScope & (
  { ok: true; data: T; error: null } |
  { ok: false; data: null; error: ApiError }
);
```

Matching representative JSON:

```json
{"schemaVersion":1,"requestId":"r1","workspaceId":"demo","branch":"main","graphCommitId":"G2","ok":true,"data":{"initialized":true},"error":null,"warnings":[],"metadata":{"nativeVersion":2}}
```

```json
{"schemaVersion":1,"requestId":"r2","workspaceId":"demo","branch":"main","graphCommitId":"G2","ok":false,"data":null,"error":{"code":"STALE_HEAD","category":"conflict","message":"Expected head differs","details":{"expected":"G1","actual":"G2"},"retryable":false},"warnings":[],"metadata":{"nativeVersion":2}}
```

Failure always has null data and a typed non-null error; success always has null error. A successful not-found entity lookup may use null data only if its declared operation result permits it; CLI missing required entity uses the notFound category. Pre-init scope fields are required nullable outputs, not omitted. Warnings cannot hide failure; nativeVersion metadata is storage context, not semantic ID. No embeddings/internal SDK objects in output.

Proposed stable CLI exits: 0 success; 1 internal; 2 invalid/unsupported; 3 not found; 4 conflict; 5 storage/history unavailable; 6 provider. Structured results go to stdout, diagnostics stderr. Flags describing caller mode are not authorization. Permission failure requires an actual host trust boundary; native permissions/mode availability have not been inspected and must not be invented.

## G1 handoff — exact small slices, not authorization

Every path below is a **reserved future path**, intentionally not a clickable existing-source claim. No proposed production command is runnable until future manifests/scripts exist. Every slice is at most approximately five files; estimates small/medium are planning labels. Existing mode matrix remains [the plan](../../tasks/plan.md:40); concrete native permissions are unknown. No custom mode/harness changes. Source reuse requires applicable rights approval before copying, even though G1 can avoid copying indexing code entirely.

| Slice / size | Dependencies | Exact future file allowlist | Focused test and acceptance |
| --- | --- | --- | --- |
| S1 contracts skeleton / small | Human gate + readiness; approved candidate | packages/contracts/package.json; packages/contracts/tsconfig.json; packages/contracts/src/index.ts; packages/contracts/src/ports.ts; packages/contracts/spec/ports.spec.ts | Compile contracts without concrete internal adapters; ports expose no Lance/Arrow/host types |
| S2 universal type/schema parity / medium | S1 | packages/contracts/src/elements.ts; packages/contracts/src/schema.ts; packages/contracts/src/envelope.ts; packages/contracts/spec/parity.spec.ts; packages/contracts/spec/envelope.spec.ts | All six categories, JSON null, evidence bounds/time rules, closed tops/extensible attributes, nullable-output and result discrimination agree |
| Checkpoint 1 | S1–S2 | No additional implementation files | Confirm dependency direction, exact schema coverage and no unsupported-operation fake success |
| S3 identity / medium | S2, human rename policy choice | packages/core/package.json; packages/core/src/identity.ts; packages/core/src/normalize.ts; packages/core/spec/identity.spec.ts; packages/core/spec/source-replacement.spec.ts | Deterministic NFC tuples, overloads/collisions, line insertion, ambiguity, changed-file retractions and A→B→A specification fixtures |
| S4 adapter atomic publish/reopen / medium | S1–S3 | packages/storage-lance/package.json; packages/storage-lance/src/adapter.ts; packages/storage-lance/src/rows.ts; packages/storage-lance/spec/publication.spec.ts; packages/storage-lance/spec/reopen.spec.ts | One merge rows+marker, uniqueness before write, no own native version, closed/reopened exact state; single-writer limitation |
| Checkpoint 2 | S3–S4 | No additional implementation files | Identity/atomicity coverage, no native branch or concurrency claim; applicable dependency notices |
| S5 semantic mapping/provenance / medium | S4 | packages/core/src/commits.ts; packages/storage-lance/src/commit-map.ts; packages/core/spec/commits.spec.ts; packages/storage-lance/spec/commit-map.spec.ts | Earliest marker appearance, rebuildable cache, retry semantics and projection revision provenance; retained version failure explicit |
| S6 application init/status / medium | S5 | packages/core/src/api.ts; packages/core/src/index.ts; packages/core/spec/init-status.spec.ts; packages/core/spec/unsupported.spec.ts | Inject narrow ports, deterministic typed init/status/close; reserved operations typed unsupported; direct consumer no host install |
| Checkpoint 3 | S5–S6 | No additional implementation files | Mapping/result invariants; status honestly reports unimplemented capabilities |
| S7 thin CLI/direct-library parity / medium | S6 | packages/cli/package.json; packages/cli/src/compose.ts; packages/cli/src/main.ts; packages/cli/spec/parity.spec.ts; packages/cli/spec/streams.spec.ts | CLI init/status uses same API as direct composition; equivalent revision envelopes, stable exits, stdout/stderr separation; no business logic duplication |

Dependency graph: G0 measured evidence + final dispositions + **explicit human acceptance** → S1 → S2 → S3 → S4 → S5 → S6 → S7. Checkpoints after 2/4/6 slices. Future per-slice typecheck/spec invocations must be defined and verified in those future manifests; this document invents no build commands. Provider A implementation is G2; semantic history/branch/merge is G3; GraphRAG is G4; packaging/agent CLI completion is G5. Root workspace/tooling setup must receive a separate exact allowlist if later necessary; the table does not authorize broad package-directory edits.

G1 acceptance requires standalone direct-library and thin CLI init/status with no host installed, parity tests, identity/evidence/time correctness, adapter atomicity/reopen/mapping and honest unsupported limitations. It does not mean all concept tests passed, or restore G6/native integration/B migration. OPEN issues: rename continuity, canonical JSON, relation ID/publication row-key definition (settle before G1 S3; see [relation fields](contracts-proposal.md:24) and [storage candidate](contracts-proposal.md:179)), migration decisions and local wiki distribution. Final security/review are complete, not contract acceptance. Selected grammar/native/dependency rights require approval before affected copying, not a blanket G1 blocker for uncopied source. This records issues only; no new contract rule is adopted.
