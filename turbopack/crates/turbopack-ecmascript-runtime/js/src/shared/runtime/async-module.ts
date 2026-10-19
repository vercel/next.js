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

const asyncModulePromiseResolve = Promise.resolve.bind(Promise)
const asyncModulePromiseThen = Promise.prototype.then
const turbopackQueues = Symbol('turbopack queues')
const turbopackExports = Symbol('turbopack exports')
const turbopackError = Symbol('turbopack error')
const turbopackAsyncModuleId = Symbol('turbopack async module id')
const turbopackAsyncSettled = Symbol('turbopack async settled')

// Only a synchronous native instantiation may bind these certified pending
// ancestors without inheriting their queues. Never retain this across an await.
let deferredOriginalBackedges: ReadonlySet<ModuleId> | undefined

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
  [turbopackAsyncModuleId]?: ModuleId
  [turbopackAsyncSettled]?: boolean
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
  ) => void | Generator<unknown, void, unknown>,
  hasAwait: boolean,
  continuation?: {
    <T>(callback: () => T): T
    resume(
      value: unknown,
      fulfilled: (value: unknown) => void,
      rejected: (error: unknown) => void
    ): void
  }
) {
  const module = this.m
  const queue: AsyncQueue | undefined = hasAwait
    ? Object.assign([], { status: QueueStatus.Unknown })
    : undefined

  const depQueues: Set<AsyncQueue> = new Set()

  const { resolve, reject, promise: rawPromise } = createPromise<Exports>()

  const promise: AsyncModulePromise = Object.assign(rawPromise, {
    [turbopackAsyncModuleId]: module.id,
    [turbopackAsyncSettled]: false,
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

    for (const dep of currentDeps) {
      const id = dep[turbopackAsyncModuleId]
      if (id !== undefined && deferredOriginalBackedges?.has(id)) continue
      dep[turbopackQueues](fnQueue)
    }

    return fn.queueCount ? promise : getResult()
  }

  function asyncResult(err?: any) {
    promise[turbopackAsyncSettled] = true
    if (err) {
      reject((promise[turbopackError] = err))
    } else {
      resolve(promise[turbopackExports])
    }

    resolveQueue(queue)
  }

  const iterator = body(handleAsyncDependencies, asyncResult)
  if (iterator && typeof iterator.next === 'function') {
    const step = (value?: unknown, rejected = false): void => {
      const advance = () => {
        let result: IteratorResult<unknown, void>
        try {
          result = rejected ? iterator.throw(value) : iterator.next(value)
        } catch (error) {
          asyncResult(error)
          return
        }
        if (!result.done) {
          const fulfilled = (value: unknown) => step(value)
          const rejected = (error: unknown) => step(error, true)
          if (continuation)
            continuation.resume(result.value, fulfilled, rejected)
          else
            Reflect.apply(
              asyncModulePromiseThen,
              asyncModulePromiseResolve(result.value),
              [fulfilled, rejected]
            )
        }
      }
      if (continuation) continuation(advance)
      else advance()
    }
    step()
  }

  if (queue && queue.status === QueueStatus.Unknown) {
    queue.status = QueueStatus.Unresolved
  }
}
contextPrototype.a = asyncModule

/** Compiler-issued lazy original edge for a certified static ESM cycle. */
function importDeferredOriginal(
  this: TurbopackBaseContext<Module>,
  originalId: ModuleId,
  ancestorIds: readonly ModuleId[],
  loadOriginal: () => unknown
): ReturnType<EsmImport> {
  const owner = this.m.namespaceObject ?? this.m.exports
  const validId = (id: unknown): id is ModuleId =>
    typeof id === 'string'
      ? id.length > 0
      : typeof id === 'number' && Number.isSafeInteger(id) && id >= 0
  if (
    !validId(originalId) ||
    originalId === this.m.id ||
    !Array.isArray(ancestorIds) ||
    ancestorIds.some((id) => !validId(id) || id === originalId) ||
    new Set(ancestorIds).size !== ancestorIds.length ||
    typeof loadOriginal !== 'function' ||
    !isAsyncModuleExt(owner) ||
    owner[turbopackAsyncModuleId] !== this.m.id ||
    typeof this.M.get(originalId) !== 'function'
  )
    throw new Error(
      'Deferred original import requires its pending native owner.'
    )
  if (owner[turbopackAsyncSettled]) {
    loadOriginal()
    return esmImport.call(this, originalId)
  }
  const retained = this.c.get(originalId)?.namespaceObject
  if (
    retained &&
    isAsyncModuleExt(retained) &&
    !retained[turbopackAsyncSettled]
  )
    throw new Error('A competing original evaluation is already pending.')
  // Only records already pending before this original load are ancestors. Fresh
  // SCC members must retain their own awaits and unrelated dependency queues.
  const backedges = new Set<ModuleId>([this.m.id])
  for (const id of ancestorIds) {
    const module = this.c.get(id)
    const namespace = module?.namespaceObject ?? module?.exports
    if (
      namespace !== null &&
      (typeof namespace === 'object' || typeof namespace === 'function') &&
      isAsyncModuleExt(namespace) &&
      namespace[turbopackAsyncModuleId] === id &&
      !namespace[turbopackAsyncSettled]
    )
      backedges.add(id)
  }
  const previous = deferredOriginalBackedges
  deferredOriginalBackedges = backedges
  try {
    loadOriginal()
    return esmImport.call(this, originalId)
  } finally {
    deferredOriginalBackedges = previous
  }
}
contextPrototype.B = importDeferredOriginal
