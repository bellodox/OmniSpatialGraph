# Experimental live simulation world

This separate feature branch adds an application API for OSG's existing temporal,
multi-client development goals. It is not a revision of the frozen MVP specification,
formal G0-G6 approval, a new storage format, or a release. Existing Apache-2.0 licensing
and third-party notices remain applicable.

## Why this design

OSG already provides content-addressed commit lineage, append-only element versions,
head compare-and-swap, snapshot reads and LanceDB connections with immediate read
consistency. Reuse those mechanisms. Keep exact simulation state in immutable byte
assets; hash only safe integer metadata, identities and asset references in the graph.

The earlier simulation adapter wrote only selected events. This API makes the graph
the publication boundary for complete accepted sample batches. Clients consume a
committed revision and can reconstruct it after restart without the simulator or the
ingestion process's memory. It does not calculate physics.

Primary research supporting the choices:

- OSG baseline: bb087f2e5c4e208b5a6cc3000af9b2fe554ecb26; inspect contracts, graph.ts,
  state.ts and storage-lance. Existing commit semantics remain unchanged.
- LanceDB read consistency: https://lancedb.github.io/lancedb/js/interfaces/ConnectionOptions/
  Setting readConsistencyInterval to zero checks other-process updates on each read.
  This is already configured by OSG and is distinct from graph head CAS.
- LanceDB maintainer discussion: https://github.com/lancedb/lancedb/discussions/899
  Small writes incur per-transaction overhead and fragments. Use bounded batches,
  not a graph transaction per integration step. The pinned store's existing compaction
  remains in use; batch-scoped duplicate-key checks and an optional single-commit
  lookup avoid transferring all historical keys for publication acknowledgements; no speculative upgrade to a new realtime engine is required.
- MCAP specification: https://mcap.dev/spec
  Indexed chunks provide a useful precedent for separating dense time-series payloads
  from a temporal index. MCAP is not introduced as a dependency or a second authority.
- Foxglove scene semantics: https://docs.foxglove.dev/docs/sdk/schemas/scene-entity
  and https://docs.foxglove.dev/docs/sdk/schemas/scene-entity-deletion
  Entity identity, reference frame, timestamps and explicit deletion matter. Never
  infer deletion from a temporarily missing sample.

## Side-by-side command installation

The experimental root package and command are named `osg-multi`. Keep this checkout
separate from the checkout used by the installed `osg` command. After building, run
`npm link --ignore-scripts --workspaces=false`, then `osg-multi --help`. The root
and CLI-workspace bin maps contain no `osg` alias. npm uses a distinct global package
location for osg-multi, so the original package and command can stay installed.
OSGSim selects this compiled checkout using OSG_MULTI_SOURCE_DIR.

## API

Build separately using the existing instructions:

```sh
npm ci --ignore-scripts --include=optional
npm run build
npm run typecheck
node --test tests/world.test.mjs
```

Import `WorldGraph` from `dist/core/src/world.js` (also exported as `./world`).
Open it with the existing GraphPort and a host-provided WorldAssets port:

```js
const world = await WorldGraph.open(store, assets);
const committed = await world.append(runId, epoch, records);
const snapshot = await world.read({runId, epoch, head: committed.head, timeMicros});
const page = await world.range({runId, epoch, head: committed.head, fromSequence: 1});
```

The host durably writes assets before returning from put. Core verifies returned
and read asset hashes. Each record identifies sequence, integration step, integer
simulation microseconds, entity, frame and state/delete operation. Its payload is
opaque bytes, so float64 positions and unknown-field flags need no quantization.
Microseconds are an index resolution, not a claim of finer time accuracy. Clients
must not interpolate across contact or epoch boundaries.

Segments use a bounded canonical header plus opaque payload bytes (4 MiB maximum,
1,024 records maximum). Each graph publication supersedes one stream descriptor and the affected entity
nodes; stable graph relationships link entities to their reference frames and epoch
streams. Entity nodes identify their exact payload asset and sequence, and explicit
deletions remain visible as lifecycle facts. This complements, rather than replaces,
the dense time-series payloads. The stream descriptor
retains its previous asset hash, ranges and affected entity identities. Earlier
descriptors remain in graph history; Lance table versions are not used for history.
No embedding inference is required for authoritative physical queries.

`read` returns the latest exact recorded state per entity at or before the selected
time. `range` pages exact records; preserve the returned head between pages. Deletion
records suppress an entity in later snapshots, while earlier snapshots retain it.
`streams` lists run/epoch ranges; `entities` exposes graph-native entity references. `marked` retains its bounded full-history query. `markedPage` reads event-bearing
segments in forward/backward sequence order, with a limit (1–1,000) and
nextSequence cursor. Carry head, runId, epoch, timeMicros and direction to subsequent
pages. Each page retains the 32 MiB read budget, so snapshots can fetch a bounded
recent window without requiring lifetime event reads. Explicit heads must be
accepted ancestors of the instance revision. `read` uses per-entity segment
candidates to skip unrelated trajectory assets; `first` retrieves an entity's original recorded state for stable local
origins after cold reconstruction. `subscribe` signals committed revisions only.

## Concurrent clients

One WorldGraph instance serializes mutations and serves immutable revision-pinned
reads. A reader can finish an older revision while another operation publishes a new
one. Copies of caller bytes prevent later buffer mutation from changing a queued write.
Subscriber exceptions cannot undo publication. Slow subscribers must be bounded by
the hosting transport, not awaited inside the commit operation.

Separate process instances use the existing storage CAS. `refresh()` observes external
writes and rebuilds from verified reachable rows. Pure `read`, `range` and `streams`
use the instance's last verified revision; call refresh when another process owns writes.
Lost races return STALE_HEAD; clients refresh/re-read and decide whether to retry.
Repeated identical batches, including late retries, create no new graph commit.

`annotate(clientId, id, {text}, expectedHead)` provides isolated client namespaces and
requires an expected revision. It can write hypothesis annotations only. It cannot
replace physical observations, approved state or policy. The host authenticates the
client identity; the core API itself is not an authentication boundary. Agents may
also read physical state without writing it. Generic existing graph API callers are
trusted code and must not bypass the host's write capability policy.

## Recovery, tests and limits

Opening verifies committed graph history. Asset corruption or missing referenced
bytes rejects reconstruction; it does not silently fall back to an ingestion cache.
Assets written before a failed publication may be unreferenced; they are not visible
simulation history. A crash before publication leaves an unpublished tail, never an
acknowledged graph revision. Recovery does not invent missing samples or continue an
old native run without a separate acknowledged recovery protocol.

Tests cover real LanceDB persistence, cold reconstruction, exact historical revision
reads, deletion and epoch isolation, byte ownership, corrupted assets, concurrent
client conflicts, separate connection refresh, and annotations that cannot gain
approved status. Existing graph and CAS tests remain required.

This is an experimental single-host path. Indexes are rebuilt on open, historical
query cost grows with history, generic commit/storage operations still inspect
lineage/row metadata, and full live snapshots may scan many segments. Bounded payloads
do not imply bounded total history. Measure and add indexes before large deployments.
No cross-machine replication, chain anchoring, receipts, simulator attestation, physics
restart determinism or graphical acceptance is claimed by these tests. The frozen
future tampering/receipt policy applies when chain replication is ready, not here.
