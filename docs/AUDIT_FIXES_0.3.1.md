# OSG multi fixes for OSGSim 0.3.1

Apply this cumulative overlay to multi at
d4ba8db2150afdb4b11382c9862e0a59305b374d. The executable remains osg-multi.
The frozen MVP specification and future multi-worktree branch are unchanged.

- WorldGraph and ParticipationGraph reject explicit heads outside accepted main
  ancestry. A failed CAS orphan is not an accepted-history query target.
- Participation lists support stable element-ID cursors, pinned heads, limits,
  active/finished state and actor/activity filters. Default 256, maximum 1,000.
- World markedPage exposes forward/backward history with head and sequence
  continuation, retaining a 32 MiB per-page asset budget. Latest snapshots can
  request a recent window; old exact records remain available in earlier pages.
- Per-entity segment candidates avoid decoding unrelated lifetime trajectories
  while reconstructing sparse or deleted entities.
- Same-handle world/participation writers reuse verified cold views and
  acknowledged publication views in a process-local WeakMap. Adoption requires
  the exact actual storage head. World indexes load only newly reachable commit
  rows on that path. Separately opened/external writers still trigger full
  verified reloads. No editable disk cache becomes an authority and head CAS
  remains the publication boundary.

Build and typecheck passed. Full suite: 144 passed, zero failed, one Windows-only
case skipped on Linux, 145 total. tests/audit-fixes.test.mjs covers orphan heads,
273-row pagination, marked history beyond one page's byte budget, sparse reads,
shared-view reuse and external-writer reload. Existing CAS, dependency,
idempotency, corruption, historical-read and cold-recovery tests also passed.

The matching OSGSim overlay includes real TCP/HTTP/WebSocket mixed-load results,
complete logs, native DLL provenance and the Windows acceptance instructions.
Both overlays are required. This does not establish maximum concurrent clients,
multi-machine consensus, receipt suitability or Windows/GPU acceptance.
