# OmniSpatialGraph (osg)

A standalone Node.js/TypeScript prototype for persistent repository facts and agent-memory episodes on embedded LanceDB. It provides lexical context with citations/staleness, append-only history, verification and episode export—not the complete GraphRAG/spatiotemporal MVP.

## Current status

**0.1.0-prototype.0 · local functional showcase · private/UNLICENSED.** Implementation and independent Windows tests are complete; final prototype code/security reviews are **pending**. No public npm release, owner license grant, native/LGPL redistribution clearance or formal G0–G6 acceptance is claimed.

## Quick start from the project root

Use Node 22/24 LTS and retain optional native dependencies. Recorded execution is Windows x64, Node 24.14.1.

| Command | Purpose |
| --- | --- |
| [`npm.cmd ci --include=optional`](package.json:32) | Install locked dependencies and optional natives. |
| [`npm.cmd run build`](package.json:27) | Compile JavaScript and declarations. |
| [`npm.cmd run typecheck`](package.json:29) | Check TypeScript without emitting. |
| [`npm.cmd test`](package.json:30) | Run repository tests. |
| [`node dist/cli/src/public.js --help`](packages/cli/src/public.ts:50) | Show the public CLI command set. |
| [`node tools/showcase.mjs "%CD%/dist/cli/src/public.js"`](tools/showcase.mjs:9) | Run the disposable RED → GREEN → fresh retrieval showcase. |

The showcase copies its fixture to a temporary workspace and removes it afterward; it does not use or delete your repository memory. It is deterministic process coordination, **not authenticated distinct LLM agents**.

## Private installed evaluation

From the checkout, [`npm.cmd pack --json --pack-destination "%TEMP%"`](tools/pack.mjs:5) runs the guarded prepack rebuild and creates the private tarball. In a **fresh disposable consumer directory**, run:

- [`npm.cmd install --ignore-scripts --no-fund --no-audit "%TEMP%/omnispatialgraph-0.1.0-prototype.0.tgz"`](tools/consumer-proof.mjs:21) — independent installation used these flags, with no consumer overrides.
- [`node_modules\.bin\osg.cmd --help`](tools/consumer-proof.mjs:101) — exercise the installed public launcher.
- [`node node_modules/omnispatialgraph/tools/showcase.mjs "%CD%/node_modules/omnispatialgraph/dist/cli/src/public.js"`](tools/showcase.mjs:9) — exercise the installed fixture and CLI.

One package exposes five compiled entrypoints with declarations: root, core, contracts, storage-lance and indexing-kilo ([manifest](package.json:12)). The public bin uses an isolated worker ([launcher](packages/cli/src/public.ts:55)); direct internal-backend/API invocation does **not** inherit its diagnostic-privacy boundary.

## Memory and evidence

The public [help](packages/cli/src/public.ts:50) lists init, sync, remember, context, history, verify and episode export. All workspace commands accept an explicit workspace directory; use JSON output for automation. Init may amend that workspace's ignore file. Use a disposable workspace, never the host indexing store.

Retrieve task context within 800 tokens, inspect entity history before edits, then sync and remember the outcome. Stored text is **untrusted hypothesis**, never policy, instructions, authenticated identity or approval. Reads do not refresh stale facts. History retains metadata, not old raw source; sync does not purge previously indexed history. Affected pre-fix stores require a fresh workspace/store for privacy.

Independent recorded checks: build/typecheck exit 0; **44 pass, 0 fail, 0 skip**; installed boundary/recovery **8 pass**; fresh script-disabled installation, native/API loading and strict consumer types passed. Installed showcase: RED 4/4 → GREEN 8/0 → fresh C 8/0 (pass/fail), both private markers/provenance at 563 estimated tokens and 2,250 characters; verification 4 commits/10 elements, two episodes, history/stale-read/no-op checks passed. Documentation did not rerun these application tests.

## Limits and distribution hold

- The public launcher captures native worker stdout/stderr, returns one validated JSON envelope and fails closed on malformed results, startup/preload failures and output floods; exit/recovery metadata survives. This does not guarantee safety against hostile Node configuration executing **before** the launcher.
- Exact pins: LanceDB 0.40.0, Arrow 18.1.0, ignore 7.0.12, Sharp 0.35.5. Bundling preserves the patched consumer closure. Recorded root/fresh/retained-consumer audits found zero vulnerabilities: the previous version-specific Sharp findings are resolved, not all security risk.
- Dependency-tree checks still exit 1: Transformers 3.0.2 requests Sharp ^0.33.5, incompatible with bundled 0.35.5. Image/embedding features are disabled and unsupported; API compatibility is unproved.
- Pre-documentation archive: 24 own files/5,556 total, about 232 MB compressed/746 MB unpacked. All seven Lance optional platform declarations remain pinned; only the Windows x64 Lance binary is bundled. Other dependencies also contain natives. This is not a minimal download or portable artifact.
- Owner permission, native/LGPL notices and redistribution obligations remain unresolved. Linux/macOS, crash/power-loss, TOCTOU, network-filesystem and large-store production behavior are unverified.

**Checkout-only references** (not packaged): [current handoff](docs/public-prototype.md), [acceptance checklist](docs/tasks/public-prototype.md), [changelog](CHANGELOG.md), [canonical specification](docs/OSG_MVP_SPEC.md:17). The whole specification, including §22, remains frozen; prototype success does not grant formal gate acceptance.
