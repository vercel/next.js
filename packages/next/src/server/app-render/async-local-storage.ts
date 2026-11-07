import type { AsyncLocalStorage, AsyncResource } from 'async_hooks'

const sharedAsyncLocalStorageNotAvailableError = new Error(
  'Invariant: AsyncLocalStorage accessed in runtime where it is not available'
)

class FakeAsyncLocalStorage<Store extends {}>
  implements AsyncLocalStorage<Store>
{
  disable(): void {
    throw sharedAsyncLocalStorageNotAvailableError
  }

  getStore(): Store | undefined {
    // This fake implementation of AsyncLocalStorage always returns `undefined`.
    return undefined
  }

  run<R>(): R {
    throw sharedAsyncLocalStorageNotAvailableError
  }

  exit<R>(): R {
    throw sharedAsyncLocalStorageNotAvailableError
  }

  enterWith(): void {
    throw sharedAsyncLocalStorageNotAvailableError
  }

  static bind<T>(fn: T): T {
    return fn
  }
}

const maybeGlobalAsyncLocalStorage =
  typeof globalThis !== 'undefined' && (globalThis as any).AsyncLocalStorage

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

export function createAsyncLocalStorage<
  Store extends {},
>(): AsyncLocalStorage<Store> {
  if (maybeGlobalAsyncLocalStorage) {
    return new maybeGlobalAsyncLocalStorage()
  }
  return new FakeAsyncLocalStorage()
}

/**
 * Returns the storage registered under `name`, and creates it on first use.
 *
 * These storages must be singletons within a realm. A store that is entered
 * through one reference to a storage must be readable through every other
 * reference to it. If it is not, code that runs inside the scope sees no store
 * at all. Module identity does not guarantee this. A realm can evaluate the
 * same `next` file more than once if the package is reachable through more than
 * one path, and then each evaluation creates a storage of its own. A global
 * symbol keeps the singleton intact for any number of copies. Worker threads
 * and edge sandboxes still get separate storages, because each of them has its
 * own `globalThis`.
 *
 * Module identity broke this way in `next dev`. A bug in Node's
 * `fs.realpathSync` can return a path with its symlinks unresolved, and the
 * module loader keys the module cache on that path. On a pnpm install it then
 * resolves `next/dist/...` through the `node_modules/next` symlink instead of
 * the real path, so the file is evaluated a second time. See
 * https://github.com/nodejs/node/pull/65113. Node versions without that fix
 * stay affected.
 *
 * The key includes the Next.js version, so two different versions of Next.js in
 * the same realm keep separate storages. Their store shapes might not be
 * compatible.
 */
export function getOrCreateGlobalAsyncLocalStorage<Store extends {}>(
  name: string
): AsyncLocalStorage<Store> {
  const key = Symbol.for(`@next/${name}@${process.env.__NEXT_VERSION}`)

  const globalStore = globalThis as typeof globalThis & {
    [key: symbol]: AsyncLocalStorage<Store> | undefined
  }

  return (globalStore[key] ??= createAsyncLocalStorage<Store>())
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
  return FakeAsyncLocalStorage.bind(fn)
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
