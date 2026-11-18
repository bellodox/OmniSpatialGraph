# Apply to the existing OSG multi branch

Extract this ZIP directly into the OmniSpatialGraph repository root, where
package.json and packages/ are located. Allow replacement. Keep your existing
multi branch; no branch creation or switching is required. This is a changed-file
overlay for a checkout based on main at bb087f2e5c4e208b5a6cc3000af9b2fe554ecb26.
It is not a complete repository.

The package and command are now named osg-multi. Keep this in a separate
folder from the checkout used by your existing osg installation. If necessary,
clone your existing local repository into a separate folder and apply these
files there. Both commands can then remain installed.

Build and register this separate multi checkout:

```powershell
npm ci --ignore-scripts --include=optional
npm run build
npm run typecheck
npm test
npm link --ignore-scripts --workspaces=false
osg-multi --help
```

Then apply the matching OSGSim changed-file ZIP to its own repository. Set its
OSG_MULTI_SOURCE_DIR to this built OSG checkout. Do not use the repository's agent-memory
store as the simulation database. Existing dependency versions and the frozen
OSG specification are unchanged. See docs/experimental-live-world.md for details.

On Windows, Get-Command osg,osg-multi shows both commands. OSGSim uses the
compiled multi API directly from OSG_MULTI_SOURCE_DIR; global CLI registration
is for terminal use and does not add a process invocation per simulation step.
