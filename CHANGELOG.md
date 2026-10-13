# Changelog

Notable changes to OmniSpatialGraph are recorded here in Keep a Changelog style. This repository is specification-only: **no application release exists, and G0 has not started**. Entries describe documentation, not shipped software.

## [Unreleased]

Documentation baseline and initialization: 2026-10-13. This date is not an application release date.

### Added

- [MVP specification 2.0](docs/OSG_MVP_SPEC.md), adopted by Bello as the authoritative baseline for the planned temporal knowledge graph and GraphRAG engine ([status record](docs/OSG_MVP_SPEC.md:926)). Prototype evidence in the specification is not repository test evidence.
- [Root agent guidance](AGENTS.md) and an [alternate agent entrypoint](CLAUDE.md), with locally retained mode guidance deferring to the specification. Local mode documentation is not a shipped application capability.
- Source-indexed local memory and a [derived maintainer wiki](docs/maintainer-wiki/index.md), initialized through reading and linked documentation only—without a knowledge graph. The gitignored local harness and locally maintained wiki are not guaranteed distributed artifacts ([initialization record](docs/maintainer-wiki/log.md)).
- This documentation changelog, explicitly authorized by the current human request. That authorization does not resolve Q7 generally or approve implementation.

### Changed

- Expanded [README.md](README.md) with a project introduction, planned MVP scope and technology targets, specification-only status, documentation navigation and the future G0 discovery-and-approval starting point. No runnable quickstart or unverified installation commands were added.
