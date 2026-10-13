# Planned Architecture

This page describes the [specified design](../OSG_MVP_SPEC.md:255), not implemented packages. The MVP is standalone, CLI-first and daemon-free; tight host integration and provider B are later revisions ([scope](../OSG_MVP_SPEC.md:43)).

| Boundary | Planned responsibility |
| --- | --- |
| Contracts | Types and schemas; no internal dependencies |
| Core | Identity, canonical hashing, validation, temporal reads, commits, merge and retrieval; depends only on contracts/ports |
| CLI | Thin transport and dependency wiring; no business logic |
| Indexing provider A | Discovery/extraction through the ingestion contract; no host extension state |
| Storage adapter | Persistence implementation; sole LanceDB/Arrow importer |

Source: [dependency rules](../OSG_MVP_SPEC.md:272). No corresponding source directories are created by this task.

## Planned data flow

Discovery → file hashing → parsing/extraction → core identity resolution → diff → one atomic commit per sync or watch batch ([pipeline](../OSG_MVP_SPEC.md:622)). Element and commit rows are append-only; the branch head is changed by CAS in the same batch. Reachable rows supply history and temporal state ([commit protocol](../OSG_MVP_SPEC.md:507)). Optional vectors are derived and written after a commit; lexical traversal must still work without them ([retrieval](../OSG_MVP_SPEC.md:641)).

Repository symbols use one-dimensional extents in the unified spatial model; moving-object fixtures exercise the same model ([purpose](../OSG_MVP_SPEC.md:51), [extent](../OSG_MVP_SPEC.md:444)). Development documentation stays separate from future runtime data ([layout](../OSG_MVP_SPEC.md:193)).

No knowledge graph is generated to document these boundaries.
