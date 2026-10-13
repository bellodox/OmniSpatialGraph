# Workflows and Verification

## Available now

This is a documentation-only repository. Build, lint, test, single-test and configured documentation-check commands are **not available**: no scripts or configurations exist. There is no application quickstart or automated gate runner to invoke. No shared project hooks were found or activated; existing Git hook configuration was not verified.

For documentation changes: read [§0](../OSG_MVP_SPEC.md:17), relevant requirements and latest §22; preserve the specification; validate file existence, relative links and line targets, wiki catalog coverage, exact agent header and unchanged spec hash. These are documentation checks, not T1–T38 passes. Do not install a checker merely to initialize documentation.

## Future gate workflow

[Appendix D](../OSG_MVP_SPEC.md:1299) requires host/repository discovery and a G0 plan, then human approval before scaffolding or installation. Each gate needs a report, append-only status entry and Bello's approval ([§15](../OSG_MVP_SPEC.md:762)). This initialization supplies none of those approvals.

The [test catalogue](../OSG_MVP_SPEC.md:786) T1–T38 specifies future tests, not existing files. G0 reproduces T16–T24, T29, T33 and T35 on Windows x64 and Linux x64, with separate evidence and exit codes for every subcommand ([G0](../OSG_MVP_SPEC.md:773)). Crash tests need at least 12 trials per platform, distinguishing kills before/after acknowledgement; zero pre-acknowledgement kills is inconclusive. Record unavailable Linux honestly, never as a pass.

## Constraints worth retaining

- Planned core/contracts use contracts and ports, not adapters; only storage-lance imports LanceDB/Arrow ([§7.2](../OSG_MVP_SPEC.md:272)).
- Planned writes append elements/commits and CAS the head in one batch. Reads are pure; row reachability, not Lance versions, defines history ([§10](../OSG_MVP_SPEC.md:507), [R15](../OSG_MVP_SPEC.md:189)).
- Safe-integer canonical hashing, normalized stable IDs and nullable variable-length int64 extents are required ([§8–§9](../OSG_MVP_SPEC.md:366)).
- Runtime storage is separate from development docs and source; never open the host index ([§6.2](../OSG_MVP_SPEC.md:224), [R13](../OSG_MVP_SPEC.md:187)).
- Third-party provenance and per-file approval precede adaptation; no copying is authorized here ([§11.1](../OSG_MVP_SPEC.md:609)).

## Memory maintenance

Refresh linked wiki summaries and short local context from verified source changes. Keep the [catalog](index.md) complete. For this initialization, no graph operation, external reindex, hook configuration or runtime store creation is allowed. See [Carbon Memory](concept-carbon-memory.md) and [scope decision](decisions.md).
