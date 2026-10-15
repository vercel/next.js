const RealPromise = Promise
const realSetTimeout = globalThis.setTimeout.bind(globalThis)
const realClearTimeout = globalThis.clearTimeout.bind(globalThis)
const owners = new WeakSet<object>()

/** The actual emitted runtime supplies this context, not a host require cache. */
export interface TurbopackImportContext {
  c: Map<unknown, { exports: unknown; namespaceObject?: unknown }>
}

/** One file owns chunk/external loading and asynchronous module observation. */
export function createModuleImportTracker(context: TurbopackImportContext) {
  const prototype = Object.getPrototypeOf(context) as object
  if (!prototype || !(context.c instanceof Map))
    throw new Error(
      'Compiled test entry is missing its Turbopack import context'
    )
  if (owners.has(prototype))
    throw new Error('Only one test file may own a Turbopack import tracker')
  owners.add(prototype)
  const pending = new Set<Promise<unknown>>()
  const settledModules = new WeakSet<object>()
  const retiredModules = new Set<{
    exports: unknown
    namespaceObject?: unknown
  }>()
  const replacements: {
    key: string
    descriptor?: PropertyDescriptor
    method: Function
  }[] = []
  const turns = new Set<{
    timer: ReturnType<typeof setTimeout>
    reject(error: Error): void
  }>()
  const cancelled = new Set<(error: Error) => void>()
  let disposed = false

  function track(value: unknown) {
    if (value instanceof RealPromise) {
      pending.add(value)
      void value.then(
        () => pending.delete(value),
        () => pending.delete(value)
      )
    }
    return value
  }

  function restore() {
    for (const { key, descriptor, method } of replacements) {
      if (Reflect.get(prototype, key) !== method) continue
      if (descriptor) Object.defineProperty(prototype, key, descriptor)
      else Reflect.deleteProperty(prototype, key)
    }
    owners.delete(prototype)
  }

  try {
    // These methods load actual chunks (including dev on-demand compilation)
    // and native external ESM. Preserve their receiver, arguments and promise.
    for (const key of ['l', 'L', 'y']) {
      const original = Reflect.get(prototype, key)
      if (typeof original !== 'function') continue
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key)
      const method = function (this: unknown, ...args: unknown[]) {
        return track(Reflect.apply(original, this, args))
      }
      Object.defineProperty(prototype, key, {
        configurable: true,
        writable: true,
        value: method,
      })
      replacements.push({ key, descriptor, method })
    }
  } catch (error) {
    restore()
    throw error
  }

  function nextTurn() {
    return new RealPromise<void>((resolve, reject) => {
      const turn = {
        timer: realSetTimeout(() => {
          turns.delete(turn)
          resolve()
        }, 0),
        reject,
      }
      turns.add(turn)
    })
  }

  return {
    /** Pending compiler-owned mock/import work shares this file's settling. */
    trackImport(value: Promise<unknown>) {
      if (disposed) throw new Error('Cannot track imports after file cleanup')
      track(value)
    },
    /** Actual records evicted by a compiler-owned reset retain their async work. */
    retireModules(
      modules: Iterable<{ exports: unknown; namespaceObject?: unknown }>
    ) {
      if (disposed)
        throw new Error('Cannot retire module evaluations after file cleanup')
      for (const module of modules) retiredModules.add(module)
    },
    async waitForImports() {
      while (true) {
        if (disposed)
          throw new Error('Cannot settle imports after file cleanup')
        // A turn lets unreturned nested import continuations register their
        // chunk/module work, and remains real when the test fakes timers.
        await nextTurn()
        if (disposed)
          throw new Error('Cannot settle imports after file cleanup')
        const modules: Promise<unknown>[] = []
        for (const module of [...context.c.values(), ...retiredModules]) {
          // asyncModule installs the same getter for exports and namespaceObject.
          // A regular CommonJS module may export an arbitrary pending Promise;
          // exporting that value does not make its module evaluation pending.
          const exportsGetter = Object.getOwnPropertyDescriptor(
            module,
            'exports'
          )?.get
          if (
            !exportsGetter ||
            exportsGetter !==
              Object.getOwnPropertyDescriptor(module, 'namespaceObject')?.get
          ) {
            retiredModules.delete(module)
            continue
          }
          const value = module.exports
          if (value instanceof RealPromise && !settledModules.has(value))
            modules.push(value)
          else retiredModules.delete(module)
        }
        const loads = [...pending]
        if (!modules.length && !loads.length) return
        let rejectCancelled!: (error: Error) => void
        const cancellation = new RealPromise<never>((_, reject) => {
          rejectCancelled = reject
          cancelled.add(reject)
        })
        try {
          await RealPromise.race([
            RealPromise.allSettled([...loads, ...modules]),
            cancellation,
          ])
        } finally {
          cancelled.delete(rejectCancelled)
        }
        for (const module of modules) settledModules.add(module)
        for (const module of retiredModules) {
          if (
            !(module.exports instanceof RealPromise) ||
            settledModules.has(module.exports)
          )
            retiredModules.delete(module)
        }
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const turn of turns) {
        realClearTimeout(turn.timer)
        turn.reject(
          new Error('Module import settling was cancelled during file cleanup')
        )
      }
      turns.clear()
      for (const reject of cancelled)
        reject(
          new Error('Module import settling was cancelled during file cleanup')
        )
      cancelled.clear()
      pending.clear()
      retiredModules.clear()
      restore()
    },
  }
}
