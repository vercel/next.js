import type { AsyncResource } from 'async_hooks'
import { maybeGlobalAsyncLocalStorage } from './async-local-storage'

// This module is for server code only: it requires `node:async_hooks`, which
// a browser bundle cannot resolve. `./async-local-storage` is also part of
// browser bundles, so the functions below must not move there.

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

export function createSnapshot(): <R, TArgs extends any[]>(
  fn: (...args: TArgs) => R,
  ...args: TArgs
) => R {
  if (maybeGlobalAsyncLocalStorage) {
    if (NodeAsyncResource) {
      const resource = new NodeAsyncResource('bound-anonymous-fn')
      return function (fn: any, ...args: any[]) {
        return resource.runInAsyncScope(fn, undefined, ...args)
      }
    }
    return maybeGlobalAsyncLocalStorage.snapshot()
  }
  return function (fn: any, ...args: any[]) {
    return fn(...args)
  }
}
