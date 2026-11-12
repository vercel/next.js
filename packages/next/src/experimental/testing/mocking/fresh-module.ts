type ModuleId = string | number
type Namespace = Record<string, unknown>
type MockOptions = { spy?: boolean }

/** Captured from the originating file's actual assertion runtime before await. */
export type FileAutomockMaterializer = <T>(value: T, options?: MockOptions) => T

interface BrowserModule {
  id: ModuleId
  parents: ModuleId[]
  children: ModuleId[]
  exports?: unknown
  namespaceObject?: unknown
}
export interface BrowserMockContext {
  m: BrowserModule
  M: Map<ModuleId, Function>
  c: Map<ModuleId, BrowserModule>
  i(id: ModuleId): unknown
  F(path: string, root?: string): string
  e: Namespace
  n(namespace: Namespace): void
  a(body: Function, ...args: unknown[]): unknown
}

/** One stable compiler-emitted adapter per dedicated original target. */
export type BrowserMockOriginalLoader = (
  evaluate: (
    context: BrowserMockContext,
    id: ModuleId,
    path: string,
    root?: string
  ) => Promise<Namespace>
) => Promise<Namespace>

interface Entry {
  result: Promise<Namespace>
  settled: boolean
  cleanups: (() => void)[]
}

const { now: nativeNow } = Date
let aliasSequence = 0

function removeDirection(ids: ModuleId[], id: ModuleId) {
  let index: number
  while ((index = ids.indexOf(id)) !== -1) ids.splice(index, 1)
}

/** Browser originals reuse the real loader/context; normal module IDs stay cached. */
export function createFreshModuleMocking(
  captureAutomock?: () => FileAutomockMaterializer,
  onLateFailure?: (error: Error) => void
) {
  const targets = new Map<BrowserMockOriginalLoader, Map<string, Entry>>()
  let disposed = false

  function cleanup(entry: Entry) {
    if (!entry.settled) return
    const errors: unknown[] = []
    for (const dispose of entry.cleanups.splice(0)) {
      try {
        dispose()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length === 1) throw errors[0]
    if (errors.length)
      throw new AggregateError(errors, 'Browser mock cleanup failed')
  }

  return {
    async importMock(
      loadOriginal: BrowserMockOriginalLoader,
      options?: MockOptions
    ): Promise<Namespace> {
      if (disposed)
        throw new Error('The module mock file context has been disposed.')
      if (!captureAutomock)
        throw new Error(
          'Browser importMock requires its file automock backend.'
        )
      // Capture the real backend and native timestamp before the first await.
      const materialize = captureAutomock()
      const mockOptions = { spy: !!options?.spy }
      const stamp = nativeNow()
      const type = mockOptions.spy ? 'autospy' : 'automock'
      let entries = targets.get(loadOriginal)
      if (!entries) targets.set(loadOriginal, (entries = new Map()))
      const key = `${stamp}:${type}`
      let entry = entries.get(key)
      if (!entry) {
        const pending: Entry = {
          result: undefined!,
          settled: false,
          cleanups: [],
        }
        // Publish before invoking the adapter or any authored module factory.
        entries.set(key, pending)
        pending.result = Promise.resolve().then(() =>
          loadOriginal(async (context, id, path, root) => {
            if (disposed)
              throw new Error('The module mock file context has been disposed.')
            const canonical = context.M.get(id)
            if (typeof canonical !== 'function')
              throw new Error(
                'Browser mock original is missing its native factory.'
              )
            let alias: string
            do {
              alias = `__next_test_import_mock_${aliasSequence++}__`
            } while (context.M.has(alias) || context.c.has(alias))
            let module: BrowserModule | undefined
            const wrapper = function (this: unknown, ...args: unknown[]) {
              const freshContext = args[0] as BrowserMockContext
              module = freshContext.m
              const fileURL = freshContext.F
              Object.defineProperty(freshContext, 'F', {
                configurable: true,
                writable: true,
                value: function (this: unknown, ...values: [string, string?]) {
                  const value = Reflect.apply(fileURL, this, values)
                  if (values[0] !== path || values[1] !== root) return value
                  const url = new URL(value)
                  url.searchParams.set('t', String(stamp))
                  url.searchParams.set('mock', type)
                  return url.href
                },
              })
              const namespace = freshContext.n
              const asyncModule = freshContext.a
              const publish = () => {
                const mocked = materialize(freshContext.e, mockOptions)
                Reflect.apply(namespace, freshContext, [mocked])
              }
              let asynchronous = false
              Object.defineProperty(freshContext, 'a', {
                configurable: true,
                writable: true,
                value: function (
                  this: unknown,
                  body: Function,
                  ...values: unknown[]
                ) {
                  asynchronous = true
                  const wrappedBody = function (
                    this: unknown,
                    ...bodyArgs: unknown[]
                  ) {
                    const asyncResult = bodyArgs[1] as Function
                    const complete = (error?: unknown) => {
                      if (error)
                        return Reflect.apply(asyncResult, undefined, [error])
                      try {
                        publish()
                      } catch (failure) {
                        return Reflect.apply(asyncResult, undefined, [failure])
                      }
                      return Reflect.apply(asyncResult, undefined, [])
                    }
                    return Reflect.apply(body, this, [
                      bodyArgs[0],
                      complete,
                      ...bodyArgs.slice(2),
                    ])
                  }
                  return Reflect.apply(asyncModule, this, [
                    wrappedBody,
                    ...values,
                  ])
                },
              })
              const result = Reflect.apply(canonical, this, args)
              if (!asynchronous) publish()
              return result
            }
            pending.cleanups.push(() => {
              const record = module ?? context.c.get(alias)
              if (record) {
                for (const parent of record.parents)
                  removeDirection(context.c.get(parent)?.children ?? [], alias)
                for (const child of record.children)
                  removeDirection(context.c.get(child)?.parents ?? [], alias)
                if (context.c.get(alias) === record) context.c.delete(alias)
              }
              if (context.M.get(alias) === wrapper) context.M.delete(alias)
            })
            context.M.set(alias, wrapper)
            return (await Reflect.apply(context.i, context, [
              alias,
            ])) as Namespace
          })
        )
        // Observe only the inner work. The public per-call promise still rejects
        // normally when ignored, and unfinished TLA is never awaited at disposal.
        const settled = () => {
          pending.settled = true
          if (disposed) {
            try {
              cleanup(pending)
            } catch (error) {
              const failure =
                error instanceof Error ? error : new Error(String(error))
              if (onLateFailure) onLateFailure(failure)
              else
                queueMicrotask(() => {
                  throw failure
                })
            }
          }
        }
        void pending.result.then(settled, settled)
        entry = pending
      }
      const inner = await entry.result
      return materialize(inner, mockOptions)
    },
    dispose() {
      if (disposed) return
      disposed = true
      const errors: unknown[] = []
      for (const entries of targets.values()) {
        for (const entry of entries.values()) {
          try {
            cleanup(entry)
          } catch (error) {
            errors.push(error)
          }
        }
      }
      targets.clear()
      if (errors.length === 1) throw errors[0]
      if (errors.length)
        throw new AggregateError(errors, 'Browser mock cleanup failed')
    },
  }
}
