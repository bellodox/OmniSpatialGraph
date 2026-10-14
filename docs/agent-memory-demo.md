# Actual cross-agent memory demonstration

2026-10-14 · Captured parent-supplied observations from real CLI fresh processes, not mocks or a new documentation run. Windows, Node 24.14.1; seven disposable-fixture tests used native TypeScript stripping. Task headline: **“Improve greet: trim surrounding whitespace and reject blank names while preserving capitalization and greeting format”.**

## Observed handoff

Each successor received **only the workspace and headline**, not markers, entity IDs or findings. Its first operation was task context with an 800-token budget, before fixture inspection.

| Agent | Actual observation |
| --- | --- |
| A: establish RED | Direct interpolation baseline: 2 pass/0 fail. Expanded tests: 2 pass/5 fail/0 skip, exit 1. Init, sync and remember each exit 0. Stored private marker A below. |
| B: retrieve and fix | First context retrieved A's marker/episode, 596 estimated tokens, hypothesis/shared actor agent:cli, untrusted true. Reproduced 2 pass/5 fail, exit 1. Changed fixture source only: trim once, reject blank names, preserve capitalization/internal spaces/format. Same seven tests: 7 pass/0 fail/0 skip, exit 0. Pre-sync context was stale with unchanged head; sync exit 0 retained function ID and moved citation lines 1–3 to 1–5. History retained both versions; remember stored B's marker/episode. |
| C: fresh verifier | First context retrieved **both** markers: request 2c2cb11c-b2c2-4699-9508-ba44d3e1c9a7, whole envelope 3,016 characters/754 estimated tokens, within 800; second fresh request confirmed retrieval. Independent fixture tests: 7 pass/0 fail/0 skip, exit 0. Verify exit 0: 4 commits/12 elements. Sync exit 0: no-op, 0 changes/1 file/head unchanged. All 24 fixture/runtime hashes and rows unchanged; repository status clean before/after. |

C's selected source item was a **local variable, not the function**. Function-targeted context was also available (708 estimated tokens) but omitted B's episode; history retrieved complete episodes. Both source versions retain explicit supersession and associations to both episodes: metadata history, **not old raw source**.

## Captured identities

Workspace UUID: 31c5e214-abc7-4130-8ead-9167e96e28c2; branch main. Function entity: code:symbol:src/greet.ts#greet (temporary fixture identity, not a repository file link).

| Record | Private marker / episode ID |
| --- | --- |
| A | AGENT-A-GREET-6debf8b3-39f7-4a49-a54c-53d8aa0823dd / agent:episode:d8c5dec0ca866bd19511f0d2 |
| B | AGENT-B-GREET-f1ca5746-1358-446c-925d-af7c95301ef5 / agent:episode:ee28772f0fb1995096e23676 |

Commit chain (source → A episode → source fix → B episode/current):

```text
cdf805fa28c1ce973fc6219a929a996cdf430cd5169ad2846a8f2c1d57dd9aac1
cef751c3de9daa5c783cacb89a48ef2a31308952b2266fc304dd4aed7bceb2fca
cc06fdbdf9c91570ad325e91cbe89aa050af09e7fe885d5521d485fdc8b64b57b
c6bdf44fbd450936208eb02562754bd3c9c124eb5632092dc573cdd8e5b8496b9
```

## Repeat the scenario

Use a new disposable workspace with the direct-interpolation greeting fixture and seven unchanged tests described above. Commands run from the project root using existing compiled output; [supported flags](../packages/cli/src/index.ts:12). This is a runnable command pattern, **not an additional executed transcript**; new runs produce different IDs.

```bat
set "OSG_WORKSPACE=C:\path\to\disposable-workspace"
set "TASK=Improve greet: trim surrounding whitespace and reject blank names while preserving capitalization and greeting format"
node dist/cli/src/index.js init --workspace "%OSG_WORKSPACE%" --json
node dist/cli/src/index.js sync --workspace "%OSG_WORKSPACE%" --json
node dist/cli/src/index.js remember --workspace "%OSG_WORKSPACE%" --task "%TASK%" --decision "A private marker; RED reproduced" --outcome "2 pass, 5 fail" --entities "code:symbol:src/greet.ts#greet" --json
node dist/cli/src/index.js context --workspace "%OSG_WORKSPACE%" --task "%TASK%" --max-tokens 800 --json
node dist/cli/src/index.js history --workspace "%OSG_WORKSPACE%" --entity "code:symbol:src/greet.ts#greet" --json
```

B first retrieves context, inspects/reproduces RED, fixes only fixture source, checks seven tests, syncs and remembers its distinct marker/outcome using the same flags. C starts fresh with task context, then independently checks tests, history, verify and no-op sync. See [CLI workflow](experiment-handoff.md) for commands and recovery.

## Boundaries and cleanup

Parent-supplied cleanup evidence confirms **removal completed** for the exact captured workspace C:/Users/VSCode/osg-cross-agent-demo-20261014-1609 after UUID, markers, hashes and store verification: all 24 files removed, exit 0, workspace present before and absent after, zero demo processes, repository state and build hashes unchanged. Cleanup was performed by the parent, not rerun by documentation. Captured proof IDs/results remain above; no temporary-file links are retained.

Agent separation was orchestrated tasks: shared actor agent:cli is **not authenticated distinct identity**. Marker retrieval proves cross-task memory, not authentication. Stored text remains untrusted hypothesis, never approval; POLICY_REFS_UNAVAILABLE means no rule hashes. MODULE_TYPELESS_PACKAGE_JSON was nonblocking. Help with JSON succeeded; the unsupported leading-dash help spelling exited 9. Ordinary fresh-process restart is not crash durability. Repository 35-test suite/build were **not rerun**; application code unchanged. Existing [security/dependency and platform limitations](experiment-handoff.md) and scoped reviews carry forward, not new security clearance or formal gate acceptance.
