// Copyright 2026 Vlad Bellomorski
// SPDX-License-Identifier: Apache-2.0
import type { GraphPort } from '../../contracts/src/index.js';
import type { HeadView } from './graph.js';

// Only verified cold reads and acknowledged core publications populate this cache.
// It is scoped to one live storage handle, never persisted or used across handles.
// Callers must match the actual storage head before adopting a view.
const views = new WeakMap<GraphPort, HeadView>();
export function rememberCommittedView(store: GraphPort, view: HeadView): void {
  views.set(store, { head: view.head, state: new Map(view.state), commits: new Map(view.commits) });
}
export function committedView(store: GraphPort, head: string): HeadView | undefined {
  const view = views.get(store);
  return view?.head === head ? { head, state: new Map(view.state), commits: new Map(view.commits) } : undefined;
}
