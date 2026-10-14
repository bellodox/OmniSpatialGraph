# Workflows and Verification

## Available now

The standalone experiment has [build/typecheck/test scripts](../../package.json:7). From the root: install with optional native dependencies, build before tests, then use the direct compiled CLI. Exact Windows CMD install, full/focused tests, CLI lifecycle, agent memory and recovery examples are in the [runnable handoff](../experiment-handoff.md). No lint/docs-check script or automated gate runner is claimed. No hook configuration is changed.

For documentation changes: read [§0](../OSG_MVP_SPEC.md:17), relevant requirements and latest §22; preserve the specification; validate file existence, relative links and line targets, wiki catalog coverage, exact agent header and unchanged spec hash. These are documentation checks, not T1–T38 passes. Do not install a checker merely to initialize documentation.

## Future gate workflow

[Appendix D](../OSG_MVP_SPEC.md:1299) describes formal gate discovery and approval. Current human authorization permits the bounded experiment, not acceptance of those gates. Each formal gate still needs evidence and Bello's approval ([§15](../OSG_MVP_SPEC.md:762)). This handoff supplies neither approval nor a gate dossier, and freezes §22 as well as the rest of the specification.

The [test catalogue](../OSG_MVP_SPEC.md:786) T1–T38 is not wholly covered by the experiment. The [reported proof record](../experiment-handoff.md) records Windows passes, not Linux or forced-crash proof. Formal G0 has separate Windows/Linux requirements ([G0](../OSG_MVP_SPEC.md:773)); missing Node in WSL is not a pass. Crash tests require classified before/after-acknowledgement trials; none are claimed here.

## Constraints worth retaining

- Planned core/contracts use contracts and ports, not adapters; only storage-lance imports LanceDB/Arrow ([§7.2](../OSG_MVP_SPEC.md:272)).
- Planned writes append elements/commits and CAS the head in one batch. Reads are pure; row reachability, not Lance versions, defines history ([§10](../OSG_MVP_SPEC.md:507), [R15](../OSG_MVP_SPEC.md:189)).
- Safe-integer canonical hashing, normalized stable IDs and nullable variable-length int64 extents are required ([§8–§9](../OSG_MVP_SPEC.md:366)).
- Runtime storage is separate from development docs and source; never open the host index ([§6.2](../OSG_MVP_SPEC.md:224), [R13](../OSG_MVP_SPEC.md:187)).
- Third-party provenance and per-file approval precede adaptation; no copying is authorized here ([§11.1](../OSG_MVP_SPEC.md:609)).

## Memory maintenance

Refresh linked wiki summaries and short local context from actual source and clearly attributed reports. Keep the [catalog](index.md) complete. This docs-only handoff changes no code/tests, harness, modes, hooks, external indexes or ignore settings and creates no runtime store or documentation graph. Final reviews are the parent's next work, not delegated here. See [Carbon Memory](concept-carbon-memory.md) and [scope decision](decisions.md).
