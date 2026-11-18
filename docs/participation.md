# Peer participation in osg-multi

This implements the first simulation-suitable part of the frozen generic
OpenSpeX direction. The package and executable remain `osg-multi`.

Build with `npm ci --ignore-scripts --include=optional`, `npm run build`, then
`npm run typecheck` and `npm test`. No dependency or storage-format change is
introduced. The baseline inspected before editing was remote multi
`d4ba8db2150afdb4b11382c9862e0a59305b374d`.

Import `ParticipationGraph` from the root compiled API (or
`dist/core/src/participation.js`) and construct it with the existing GraphPort.
The host supplies a trusted actor identity. Core is not an authentication
boundary and does not accept participant approval or arbitrary physical changes.

```js
const peers = new ParticipationGraph(store);
const started = await peers.submit(authenticatedActor, {
  sessionId: 'session-unique-id', requestId: 'request-unique-id',
  contextId: 'simulation/run-id/0', activityId: 'contact-study',
  action: 'start', text: 'Investigating contact behavior', expectedVersion: null,
  requires: []
});
const items = await peers.list({contextId: 'simulation/run-id/0'});
await peers.submit(authenticatedActor, {
  sessionId: 'session-unique-id', requestId: 'next-request-id',
  contextId: 'simulation/run-id/0', activityId: 'contact-study',
  action: 'finish', text: 'Study finished; findings remain hypotheses',
  expectedVersion: started.version
});
```

Actions are start, note and finish. Starting does not reserve or lock resources.
Activities, actors and contexts are graph nodes linked by started_by/in_context.
Positive resource dependencies create used_version links with their exact
observed version; those links preserve historical usage, not current ownership.
All participant facts remain untrusted hypotheses. Session and request IDs are
scoped to the actor. The same request returns its original application version
after later updates or a cold reopen; changed content under the same ID conflicts.

Use `requires:[{elementId,version}]` for concrete read dependencies. A null version
requires that specific element to be absent. The expected activity version
prevents overwriting another update. These are exact-element guards, not a
general predicate/range transaction implementation. Unrelated head advances are
retried internally against fresh state, up to eight attempts. Validation and the
deduplication record publish together through the existing head CAS. Authentication,
domain validation and permissions are supplied by the host.

`list({head})` returns the activity state at a pinned graph revision. Its default
limit is 256, maximum 1,000, with explicit truncated and nextAfter fields. Continue with after=nextAfter and the same head. Optional state (active/finished), actor and activityId filters apply before pagination. Explicit heads must be accepted main-history ancestors; failed-CAS orphan commits are rejected. Mutation queues are
bounded at 64 per instance. Separate processes retain storage CAS and bounded
revalidation; this is not cross-machine consensus or unlimited concurrency.

World appends without an explicitly pinned expectedHead now retry unrelated head
races. Stream sequence/time rules are rechecked on every attempt. Explicit
expectedHead writes and legacy annotations preserve their strict conflict behavior.
World entity references now expose the exact row version for dependency checks.

Worktree-aware sync, automatic Git integration, leases, arbitrary predicate guards,
replication, chain anchoring and receipt issuance remain outside this change.
History/query costs still require measurement for large long-lived deployments.

WorldGraph and ParticipationGraph on the same GraphPort reuse a verified,
in-memory committed view after successful publication. Every adoption checks the
storage head. World history loads only new commit rows on this path. Separate
storage handles or unrelated external changes still force a verified reload.
No editable disk cache becomes authoritative.
