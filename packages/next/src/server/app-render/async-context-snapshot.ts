import type { AsyncResource } from 'async_hooks'
import {
  createSnapshot as createSnapshotWith,
  maybeGlobalAsyncLocalStorage,
  type Snapshot,
} from './async-local-storage'

// This module is for server code only: it requires `node:async_hooks`, which
// a browser bundle cannot resolve. `./async-local-storage` is also part of
// browser bundles, so the code that needs `AsyncResource` must not move there.

// In Node.js, `AsyncLocalStorage.bind()` and `AsyncLocalStorage.snapshot()`
// return a function made by `AsyncResource.prototype.bind()`, which defines the
// deprecated `asyncResource` accessor on it. V8 keeps accessors in the old
// generation, so a minor garbage collection cannot free what such a function
// captured: the async context, with every store of the request. Entering an
// `AsyncResource` ourselves restores the same context without that accessor.
let NodeAsyncResource: typeof AsyncResource | undefined
if (process.env.NEXT_RUNTIME === 'edge') {
  NodeAsyncResource = undefined
} else {
  NodeAsyncResource = (
    require('node:async_hooks') as typeof import('node:async_hooks')
  ).AsyncResource
}

export function bindSnapshot<T>(
  // WARNING: Don't pass a named function to this argument! See: https://github.com/facebook/react/pull/34911
  fn: T
): T {
  if (maybeGlobalAsyncLocalStorage) {
    if (NodeAsyncResource) {
      // The resource type is the one `AsyncResource.bind()` uses.
      const resource = new NodeAsyncResource(
        (fn as Function).name || 'bound-anonymous-fn'
      )
      return function (this: unknown, ...args: unknown[]) {
        return resource.runInAsyncScope(fn as any, this, ...args)
      } as T
    }
    return maybeGlobalAsyncLocalStorage.bind(fn)
  }
  return fn
}

function createAsyncResourceSnapshot(
  AsyncResourceClass: typeof AsyncResource
): Snapshot {
  const resource = new AsyncResourceClass('bound-anonymous-fn')
  return function (fn: any, ...args: any[]) {
    return resource.runInAsyncScope(fn, undefined, ...args)
  }
}

// What takes a snapshot in Node.js, in place of `AsyncLocalStorage`. Where
// `AsyncLocalStorage` does not exist, there is no context to capture.
const nodeSnapshotSource =
  NodeAsyncResource && maybeGlobalAsyncLocalStorage
    ? { snapshot: createAsyncResourceSnapshot.bind(null, NodeAsyncResource) }
    : undefined

// The function in `./async-local-storage` decides whether a context is
// captured at all, because adapters patch that decision there. This module
// only supplies how Node.js captures it.
export function createSnapshot(): Snapshot {
  return createSnapshotWith(nodeSnapshotSource)
}
