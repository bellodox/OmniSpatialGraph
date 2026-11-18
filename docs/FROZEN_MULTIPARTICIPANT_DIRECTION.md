# Frozen future OpenSpeX direction — 18 November 2026

Frozen by Bello's instruction in this session. This is a future development
decision, separate from the frozen MVP specification; no MVP gate is approved.

- One general multi-participant OSG core supports independent agents, humans,
  browsers, tools and simulations. A permanent orchestrator is optional.
- Actors, activities, contexts, resources, versioned observations, changes and
  outcomes are the common model. Starting work normally supplies awareness;
  exclusive ownership applies only where an application's rules require it.
- Git worktrees and simulation clients are adapters over that model. Worktree
  isolation is optional and is not the universal OpenSpeX participation model.
- Changes validate their declared dependencies and domain rules before atomic
  publication. CRDTs may support suitable operations; convergence alone does
  not establish a valid program, game outcome or transfer.
- Preserve content-addressed history, exact assets and independently identifiable
  application rules. Future replication needs its own explicit protocol.
- When chain replication and receipts are ready, unreliable simulation sources
  or changed rules block receipt issuance. This work does not activate receipts.

The `multi-worktree` development line and executable `osg-multi-worktree` are
frozen for future work. Its supplied baseline and proposal are retained in
`OmniSpatialGraph-multi-worktree-Changed-Files.zip` (Library identity
`libfile_43f38840b8e08191ae52526fe96614c1`). It was a local experimental branch;
the GitHub branch inventory checked for this task did not contain that name.
Freezing here does not claim GitHub branch protection or a remote push.

The present authorized work targets OSG `multi` / `osg-multi` and OSGSim
v0.3.0-dev. Suitable shared-graph primitives are implemented there without
developing worktree indexing or Git integration. The future worktree checkout
is left unchanged.
