# OSG multi 0.3.1 integration fixes

Apply these complete changed files over the OmniSpatialGraph multi branch at
 d4ba8db2150afdb4b11382c9862e0a59305b374d. The package and executable remain
osg-multi. The future multi-worktree line is frozen and is not changed.

```powershell
npm ci --ignore-scripts --include=optional
npm run build
npm run typecheck
npm test
npm link --ignore-scripts --workspaces=false
osg-multi --help
```

Then apply the matching OSGSim v0.3.1 overlay. Its OSG_MULTI_SOURCE_DIR must
point to this built checkout. No dependency or storage-format migration is
introduced. Existing world history remains readable. Read docs/participation.md
for the generic API and docs/FROZEN_MULTIPARTICIPANT_DIRECTION.md for the frozen
future design. Core queues and retries are bounded; peer activities remain
hypotheses rather than physical control or approval.

See docs/AUDIT_FIXES_0.3.1.md for accepted-history checks, bounded event pages,
activity pagination and shared-handle committed-view reuse.
