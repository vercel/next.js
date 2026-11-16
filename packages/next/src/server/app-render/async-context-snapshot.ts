import {
  createSnapshot as createSnapshotWith,
  maybeGlobalAsyncLocalStorage,
  type Snapshot,
} from './async-local-storage'

// This module is for server code only: it requires `node:async_hooks`, which
// a browser bundle cannot resolve. `./async-local-storage` is also part of
// browser bundles, so the code that needs `AsyncResource` must not move there.

// In Node.js 20 to 24, `AsyncLocalStorage.bind()` and
// `AsyncLocalStorage.snapshot()` return a function made by
// `AsyncResource.prototype.bind()`, which defines the deprecated
// `asyncResource` accessor on it (Node.js 26 no longer does). V8 keeps
// accessors in the old generation, so a minor garbage collection cannot free
// what such a function captured: the async context, with every store of the
// request. Entering an `AsyncResource` ourselves restores the same context
// without that accessor.

// What binds a function and what takes a snapshot in Node.js, in place of
// `AsyncLocalStorage`. Both are created inside the `else` branch, which is
// not part of a bundle for the Edge runtime, so that such a bundle has none of
// the Node.js code. Where `AsyncLocalStorage` does not exist, there is no
// context to capture, and both stay undefined.
let bindToAsyncResource: (<T>(fn: T) => T) | undefined
let nodeSnapshotSource: { snapshot(): Snapshot } | undefined
if (process.env.NEXT_RUNTIME === 'edge') {
  // The Edge runtime binds and takes snapshots with `AsyncLocalStorage`.
} else {
  const { AsyncResource } =
    require('node:async_hooks') as typeof import('node:async_hooks')
  if (maybeGlobalAsyncLocalStorage) {
    bindToAsyncResource = function <T>(fn: T): T {
      // The resource type is the one `AsyncResource.bind()` uses.
      const resource = new AsyncResource(
        (fn as Function).name || 'bound-anonymous-fn'
      )
      return function (this: unknown, ...args: unknown[]) {
        return resource.runInAsyncScope(fn as any, this, ...args)
      } as T
    }
    nodeSnapshotSource = {
      snapshot() {
        const resource = new AsyncResource('bound-anonymous-fn')
        return function (fn: any, ...args: any[]) {
          return resource.runInAsyncScope(fn, undefined, ...args)
        }
      },
    }
  }
}

export function bindSnapshot<T>(
  // WARNING: Don't pass a named function to this argument! See: https://github.com/facebook/react/pull/34911
  fn: T
): T {
  if (bindToAsyncResource) {
    return bindToAsyncResource(fn)
  }
  if (maybeGlobalAsyncLocalStorage) {
    return maybeGlobalAsyncLocalStorage.bind(fn)
  }
  return fn
}

// The function in `./async-local-storage` decides whether a context is
// captured at all, because adapters patch that decision there. This module
// only supplies how Node.js captures it.
export function createSnapshot(): Snapshot {
  return createSnapshotWith(nodeSnapshotSource)
}
