import type { AsyncLocalStorage } from 'async_hooks'

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

type AsyncResourceConstructor = typeof import('async_hooks').AsyncResource

// The `AsyncResource` of Node.js, when the global `AsyncLocalStorage` is the
// one of Node.js. A snapshot is taken with it directly, because
// `AsyncLocalStorage.snapshot()` and `AsyncLocalStorage.bind()` are costly for
// something that is done for every request: they redefine properties of the
// function they return, and wrap the accessors of its deprecated
// `asyncResource` property with `util.deprecate()`, which changes the
// prototype of the wrapper. That allocates hidden classes and accessor pairs
// in the old generation that point at the new function, so everything the
// function can reach, which is the async context and with it the stores of
// the request, survives every scavenge until the next major GC.
//
// This module is also bundled for the Edge runtime and for the browser, so it
// can't require `async_hooks`, and it is loaded unbundled by the Node.js
// server, so it can't decide by `process.env.NEXT_RUNTIME` either: that would
// be an environment variable read at runtime. `node-environment-baseline`,
// which only Node.js loads and which also provides the global
// `AsyncLocalStorage`, registers the module on `globalThis` under this key.
let NodeAsyncResource: AsyncResourceConstructor | undefined
const nodeAsyncHooks:
  | Pick<typeof import('async_hooks'), 'AsyncLocalStorage' | 'AsyncResource'>
  | undefined =
  typeof globalThis !== 'undefined'
    ? (globalThis as any)[Symbol.for('@next/node-async-hooks')]
    : undefined
if (
  nodeAsyncHooks &&
  nodeAsyncHooks.AsyncLocalStorage === maybeGlobalAsyncLocalStorage
) {
  NodeAsyncResource = nodeAsyncHooks.AsyncResource
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
    return maybeGlobalAsyncLocalStorage.bind(fn)
  }
  return FakeAsyncLocalStorage.bind(fn)
}

export function createSnapshot(): <R, TArgs extends any[]>(
  fn: (...args: TArgs) => R,
  ...args: TArgs
) => R {
  if (NodeAsyncResource !== undefined) {
    // Does what `AsyncLocalStorage.snapshot()` does: the resource captures the
    // current async context, and `runInAsyncScope` runs `fn` in it. The
    // resource has the type that `snapshot()` gives it.
    const resource = new NodeAsyncResource('bound-anonymous-fn')
    return function runInSnapshot<R, TArgs extends any[]>(
      fn: (...args: TArgs) => R,
      ...args: TArgs
    ): R {
      return resource.runInAsyncScope(fn, undefined, ...args)
    }
  }
  if (maybeGlobalAsyncLocalStorage) {
    return maybeGlobalAsyncLocalStorage.snapshot()
  }
  return function (fn: any, ...args: any[]) {
    return fn(...args)
  }
}
