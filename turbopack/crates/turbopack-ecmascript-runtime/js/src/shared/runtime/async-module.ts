/// <reference path="./runtime-types.d.ts" />
/// <reference path="./runtime-utils.ts" />

/**
 * Top-level-await / async-module machinery. This is only included in the runtime
 * when the module graph actually contains an async module (a module with
 * top-level await, or one that transitively depends on one). When no async
 * module is present, the chunk items never reference `__turbopack_context__.a`,
 * so this whole file can be omitted.
 *
 * everything below is adapted from webpack
 * https://github.com/webpack/webpack/blob/6be4065ade1e252c1d8dcba4af0f43e32af1bdc1/lib/runtime/AsyncModuleRuntimeModule.js#L13
 */

const turbopackQueues = Symbol('turbopack queues')
const turbopackExports = Symbol('turbopack exports')
const turbopackError = Symbol('turbopack error')

const enum QueueStatus {
  Unknown = -1,
  Unresolved = 0,
  Resolved = 1,
}

type AsyncQueueFn = (() => void) & { queueCount: number }
type AsyncQueue = AsyncQueueFn[] & {
  status: QueueStatus
}

type Dep = Exports | AsyncModulePromise | Promise<Exports>

type AsyncModuleExt = {
  [turbopackQueues]: (fn: (queue: AsyncQueue) => void) => void
  [turbopackExports]: Exports
  [turbopackError]?: any
}

type AsyncModulePromise<T = Exports> = Promise<T> & AsyncModuleExt

function isPromise<T = any>(maybePromise: any): maybePromise is Promise<T> {
  return (
    maybePromise != null &&
    typeof maybePromise === 'object' &&
    'then' in maybePromise &&
    typeof maybePromise.then === 'function'
  )
}

function isAsyncModuleExt<T extends {}>(obj: T): obj is AsyncModuleExt & T {
  return turbopackQueues in obj
}

function createPromise<T>() {
  let resolve: (value: T | PromiseLike<T>) => void
  let reject: (reason?: any) => void

  const promise = new Promise<T>((res, rej) => {
    reject = rej
    resolve = res
  })

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  }
}

function resolveQueue(queue?: AsyncQueue) {
  if (queue && queue.status !== QueueStatus.Resolved) {
    queue.status = QueueStatus.Resolved
    queue.forEach((fn) => fn.queueCount--)
    queue.forEach((fn) => (fn.queueCount-- ? fn.queueCount++ : fn()))
  }
}

function wrapDeps(deps: Dep[]): AsyncModuleExt[] {
  return deps.map((dep): AsyncModuleExt => {
    if (dep !== null && typeof dep === 'object') {
      if (isAsyncModuleExt(dep)) return dep
      if (isPromise(dep)) {
        const queue: AsyncQueue = Object.assign([], {
          status: QueueStatus.Unresolved,
        })

        const obj: AsyncModuleExt = {
          [turbopackExports]: {},
          [turbopackQueues]: (fn: (queue: AsyncQueue) => void) => fn(queue),
        }

        dep.then(
          (res) => {
            obj[turbopackExports] = res
            resolveQueue(queue)
          },
          (err) => {
            obj[turbopackError] = err
            resolveQueue(queue)
          }
        )

        return obj
      }
    }

    return {
      [turbopackExports]: dep,
      [turbopackQueues]: () => {},
    }
  })
}

function asyncModule(
  this: TurbopackBaseContext<Module>,
  body: (
    handleAsyncDependencies: (
      deps: Dep[]
    ) => Exports[] | Promise<() => Exports[]>,
    asyncResult: (err?: any) => void
  ) => void,
  hasAwait: boolean
) {
  const module = this.m
  const queue: AsyncQueue | undefined = hasAwait
    ? Object.assign([], { status: QueueStatus.Unknown })
    : undefined

  const depQueues: Set<AsyncQueue> = new Set()

  const { resolve, reject, promise: rawPromise } = createPromise<Exports>()

  const promise: AsyncModulePromise = Object.assign(rawPromise, {
    [turbopackExports]: module.exports,
    [turbopackQueues]: (fn) => {
      queue && fn(queue)
      depQueues.forEach(fn)
      promise['catch'](() => {})
    },
  } satisfies AsyncModuleExt)

  const attributes: PropertyDescriptor = {
    get(): any {
      return promise
    },
    set(v: any) {
      // Calling `esmExport` leads to this.
      if (v !== promise) {
        promise[turbopackExports] = v
      }
    },
  }

  Object.defineProperty(module, 'exports', attributes)
  Object.defineProperty(module, 'namespaceObject', attributes)

  function handleAsyncDependencies(deps: Dep[]) {
    const currentDeps = wrapDeps(deps)

    const getResult = () =>
      currentDeps.map((d) => {
        if (d[turbopackError]) throw d[turbopackError]
        return d[turbopackExports]
      })

    const { promise, resolve } = createPromise<() => Exports[]>()

    const fn: AsyncQueueFn = Object.assign(() => resolve(getResult), {
      queueCount: 0,
    })

    function fnQueue(q: AsyncQueue) {
      if (q !== queue && !depQueues.has(q)) {
        depQueues.add(q)
        if (q && q.status === QueueStatus.Unresolved) {
          fn.queueCount++
          q.push(fn)
        }
      }
    }

    currentDeps.map((dep) => dep[turbopackQueues](fnQueue))

    return fn.queueCount ? promise : getResult()
  }

  function asyncResult(err?: any) {
    if (err) {
      reject((promise[turbopackError] = err))
    } else {
      resolve(promise[turbopackExports])
    }

    resolveQueue(queue)
  }

  body(handleAsyncDependencies, asyncResult)

  if (queue && queue.status === QueueStatus.Unknown) {
    queue.status = QueueStatus.Unresolved
  }
}
contextPrototype.a = asyncModule
