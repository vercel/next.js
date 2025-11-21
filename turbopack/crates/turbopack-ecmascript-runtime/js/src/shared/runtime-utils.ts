/**
 * This file contains runtime types and functions that are shared between all
 * TurboPack ECMAScript runtimes.
 *
 * It will be prepended to the runtime code of each runtime.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="./runtime-types.d.ts" />

type EsmNamespaceObject = Record<string, any>

// @ts-ignore Defined in `dev-base.ts`
declare function getOrInstantiateModuleFromParent<M>(
  id: ModuleId,
  sourceModule: M
): M

const REEXPORTED_OBJECTS = new WeakMap<Module, ReexportedObjects>()

/**
 * Constructs the `__turbopack_context__` object for a module.
 */
function Context(
  this: TurbopackBaseContext<Module>,
  module: Module,
  exports: Exports
) {
  this.m = module
  // We need to store this here instead of accessing it from the module object to:
  // 1. Make it available to factories directly, since we rewrite `this` to
  //    `__turbopack_context__.e` in CJS modules.
  // 2. Support async modules which rewrite `module.exports` to a promise, so we
  //    can still access the original exports object from functions like
  //    `esmExport`
  // Ideally we could find a new approach for async modules and drop this property altogether.
  this.e = exports
}
const contextPrototype = Context.prototype as TurbopackBaseContext<Module>

type ModuleContextMap = Record<ModuleId, ModuleContextEntry>

interface ModuleContextEntry {
  id: () => ModuleId
  module: () => any
}

interface ModuleContext {
  // require call
  (moduleId: ModuleId): Exports | EsmNamespaceObject

  // async import call
  import(moduleId: ModuleId): Promise<Exports | EsmNamespaceObject>

  keys(): ModuleId[]

  resolve(moduleId: ModuleId): ModuleId
}

type GetOrInstantiateModuleFromParent<M extends Module> = (
  moduleId: M['id'],
  parentModule: M
) => M

declare function getOrInstantiateRuntimeModule(
  chunkPath: ChunkPath,
  moduleId: ModuleId
): Module

const hasOwnProperty = Object.prototype.hasOwnProperty
const toStringTag = typeof Symbol !== 'undefined' && Symbol.toStringTag

function defineProp(
  obj: any,
  name: PropertyKey,
  options: PropertyDescriptor & ThisType<any>
) {
  if (!hasOwnProperty.call(obj, name)) Object.defineProperty(obj, name, options)
}

function getOverwrittenModule(
  moduleCache: ModuleCache<Module>,
  id: ModuleId
): Module {
  let module = moduleCache[id]
  if (!module) {
    // This is invoked when a module is merged into another module, thus it wasn't invoked via
    // instantiateModule and the cache entry wasn't created yet.
    module = createModuleObject(id)
    moduleCache[id] = module
  }
  return module
}

/**
 * Creates the module object. Only done here to ensure all module objects have the same shape.
 */
function createModuleObject(id: ModuleId): Module {
  return {
    exports: {},
    error: undefined,
    id,
    namespaceObject: undefined,
  }
}

type BindingTag = 0
const BindingTag_Value = 0 as BindingTag

// an arbitrary sequence of bindings as
// - a prop name
// - BindingTag_Value, a value to be bound directly, or
// - 1 or 2 functions to bind as getters and sdetters
type EsmBindings = Array<
  string | BindingTag | (() => unknown) | ((v: unknown) => void) | unknown
>

/**
 * Adds the getters to the exports object.
 */
function esm(exports: Exports, bindings: EsmBindings) {
  defineProp(exports, '__esModule', { value: true })
  if (toStringTag) defineProp(exports, toStringTag, { value: 'Module' })
  let i = 0
  while (i < bindings.length) {
    const propName = bindings[i++] as string
    const tagOrFunction = bindings[i++]
    if (typeof tagOrFunction === 'number') {
      if (tagOrFunction === BindingTag_Value) {
        defineProp(exports, propName, {
          value: bindings[i++],
          enumerable: true,
          writable: false,
        })
      } else {
        throw new Error(`unexpected tag: ${tagOrFunction}`)
      }
    } else {
      const getterFn = tagOrFunction as () => unknown
      if (typeof bindings[i] === 'function') {
        const setterFn = bindings[i++] as (v: unknown) => void
        defineProp(exports, propName, {
          get: getterFn,
          set: setterFn,
          enumerable: true,
        })
      } else {
        defineProp(exports, propName, {
          get: getterFn,
          enumerable: true,
        })
      }
    }
  }
  Object.seal(exports)
}

/**
 * Makes the module an ESM with exports
 */
function esmExport(
  this: TurbopackBaseContext<Module>,
  bindings: EsmBindings,
  id: ModuleId | undefined
) {
  let module: Module
  let exports: Module['exports']
  if (id != null) {
    module = getOverwrittenModule(this.c, id)
    exports = module.exports
  } else {
    module = this.m
    exports = this.e
  }
  module.namespaceObject = exports
  esm(exports, bindings)
}
contextPrototype.s = esmExport

type ReexportedObjects = Record<PropertyKey, unknown>[]
function ensureDynamicExports(
  module: Module,
  exports: Exports
): ReexportedObjects {
  let reexportedObjects: ReexportedObjects | undefined =
    REEXPORTED_OBJECTS.get(module)

  if (!reexportedObjects) {
    REEXPORTED_OBJECTS.set(module, (reexportedObjects = []))
    module.exports = module.namespaceObject = new Proxy(exports, {
      get(target, prop) {
        if (
          hasOwnProperty.call(target, prop) ||
          prop === 'default' ||
          prop === '__esModule'
        ) {
          return Reflect.get(target, prop)
        }
        for (const obj of reexportedObjects!) {
          const value = Reflect.get(obj, prop)
          if (value !== undefined) return value
        }
        return undefined
      },
      ownKeys(target) {
        const keys = Reflect.ownKeys(target)
        for (const obj of reexportedObjects!) {
          for (const key of Reflect.ownKeys(obj)) {
            if (key !== 'default' && !keys.includes(key)) keys.push(key)
          }
        }
        return keys
      },
    })
  }
  return reexportedObjects
}

/**
 * Dynamically exports properties from an object
 */
function dynamicExport(
  this: TurbopackBaseContext<Module>,
  object: Record<string, any>,
  id: ModuleId | undefined
) {
  let module: Module
  let exports: Exports
  if (id != null) {
    module = getOverwrittenModule(this.c, id)
    exports = module.exports
  } else {
    module = this.m
    exports = this.e
  }
  const reexportedObjects = ensureDynamicExports(module, exports)

  if (typeof object === 'object' && object !== null) {
    reexportedObjects.push(object)
  }
}
contextPrototype.j = dynamicExport

function exportValue(
  this: TurbopackBaseContext<Module>,
  value: any,
  id: ModuleId | undefined
) {
  let module: Module
  if (id != null) {
    module = getOverwrittenModule(this.c, id)
  } else {
    module = this.m
  }
  module.exports = value
}
contextPrototype.v = exportValue

function exportNamespace(
  this: TurbopackBaseContext<Module>,
  namespace: any,
  id: ModuleId | undefined
) {
  let module: Module
  if (id != null) {
    module = getOverwrittenModule(this.c, id)
  } else {
    module = this.m
  }
  module.exports = module.namespaceObject = namespace
}
contextPrototype.n = exportNamespace

function createGetter(obj: Record<string | symbol, any>, key: string | symbol) {
  return () => obj[key]
}

/**
 * @returns prototype of the object
 */
const getProto: (obj: any) => any = Object.getPrototypeOf
  ? (obj) => Object.getPrototypeOf(obj)
  : (obj) => obj.__proto__

/** Prototypes that are not expanded for exports */
const LEAF_PROTOTYPES = [null, getProto({}), getProto([]), getProto(getProto)]

/**
 * @param raw
 * @param ns
 * @param allowExportDefault
 *   * `false`: will have the raw module as default export
 *   * `true`: will have the default property as default export
 */
function interopEsm(
  raw: Exports,
  ns: EsmNamespaceObject,
  allowExportDefault?: boolean
) {
  const bindings: EsmBindings = []
  let defaultLocation = -1
  for (
    let current = raw;
    (typeof current === 'object' || typeof current === 'function') &&
    !LEAF_PROTOTYPES.includes(current);
    current = getProto(current)
  ) {
    for (const key of Object.getOwnPropertyNames(current)) {
      bindings.push(key, createGetter(raw, key))
      if (defaultLocation === -1 && key === 'default') {
        defaultLocation = bindings.length - 1
      }
    }
  }

  // this is not really correct
  // we should set the `default` getter if the imported module is a `.cjs file`
  if (!(allowExportDefault && defaultLocation >= 0)) {
    // Replace the binding with one for the namespace itself in order to preserve iteration order.
    if (defaultLocation >= 0) {
      // Replace the getter with the value
      bindings.splice(defaultLocation, 1, BindingTag_Value, raw)
    } else {
      bindings.push('default', BindingTag_Value, raw)
    }
  }

  esm(ns, bindings)
  return ns
}

function createNS(raw: Module['exports']): EsmNamespaceObject {
  if (typeof raw === 'function') {
    return function (this: any, ...args: any[]) {
      return raw.apply(this, args)
    }
  } else {
    return Object.create(null)
  }
}

function esmImport(
  this: TurbopackBaseContext<Module>,
  id: ModuleId
): Exclude<Module['namespaceObject'], undefined> {
  const module = getOrInstantiateModuleFromParent(id, this.m)

  // any ES module has to have `module.namespaceObject` defined.
  if (module.namespaceObject) return module.namespaceObject

  // only ESM can be an async module, so we don't need to worry about exports being a promise here.
  const raw = module.exports
  return (module.namespaceObject = interopEsm(
    raw,
    createNS(raw),
    raw && (raw as any).__esModule
  ))
}
contextPrototype.i = esmImport

function asyncLoader(
  this: TurbopackBaseContext<Module>,
  moduleId: ModuleId
): Promise<Exports> {
  const loader = this.r(moduleId) as (
    importFunction: EsmImport
  ) => Promise<Exports>
  return loader(esmImport.bind(this))
}
contextPrototype.A = asyncLoader

// Add a simple runtime require so that environments without one can still pass
// `typeof require` CommonJS checks so that exports are correctly registered.
const runtimeRequire =
  // @ts-ignore
  typeof require === 'function'
    ? // @ts-ignore
      require
    : function require() {
        throw new Error('Unexpected use of runtime require')
      }
contextPrototype.t = runtimeRequire

function commonJsRequire(
  this: TurbopackBaseContext<Module>,
  id: ModuleId
): Exports {
  return getOrInstantiateModuleFromParent(id, this.m).exports
}
contextPrototype.r = commonJsRequire

/**
 * `require.context` and require/import expression runtime.
 */
function moduleContext(map: ModuleContextMap): ModuleContext {
  function moduleContext(id: ModuleId): Exports {
    if (hasOwnProperty.call(map, id)) {
      return map[id].module()
    }

    const e = new Error(`Cannot find module '${id}'`)
    ;(e as any).code = 'MODULE_NOT_FOUND'
    throw e
  }

  moduleContext.keys = (): ModuleId[] => {
    return Object.keys(map)
  }

  moduleContext.resolve = (id: ModuleId): ModuleId => {
    if (hasOwnProperty.call(map, id)) {
      return map[id].id()
    }

    const e = new Error(`Cannot find module '${id}'`)
    ;(e as any).code = 'MODULE_NOT_FOUND'
    throw e
  }

  moduleContext.import = async (id: ModuleId) => {
    return await (moduleContext(id) as Promise<Exports>)
  }

  return moduleContext
}
contextPrototype.f = moduleContext

/**
 * Returns the path of a chunk defined by its data.
 */
function getChunkPath(chunkData: ChunkData): ChunkPath {
  return typeof chunkData === 'string' ? chunkData : chunkData.path
}

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

// Load the CompressedmoduleFactories of a chunk into the `moduleFactories` Map.
// The CompressedModuleFactories format is
// - 1 or more module ids
// - a module factory function
// So walking this is a little complex but the flat structure is also fast to
// traverse, we can use `typeof` operators to distinguish the two cases.
function installCompressedModuleFactories(
  chunkModules: CompressedModuleFactories,
  offset: number,
  moduleFactories: ModuleFactories,
  newModuleId?: (id: ModuleId) => void
) {
  let i = offset
  while (i < chunkModules.length) {
    let moduleId = chunkModules[i] as ModuleId
    let end = i + 1
    // Find our factory function
    while (
      end < chunkModules.length &&
      typeof chunkModules[end] !== 'function'
    ) {
      end++
    }
    if (end === chunkModules.length) {
      throw new Error('malformed chunk format, expected a factory function')
    }
    // Each chunk item has a 'primary id' and optional additional ids. If the primary id is already
    // present we know all the additional ids are also present, so we don't need to check.
    if (!moduleFactories.has(moduleId)) {
      const moduleFactoryFn = chunkModules[end] as Function
      applyModuleFactoryName(moduleFactoryFn)
      newModuleId?.(moduleId)
      for (; i < end; i++) {
        moduleId = chunkModules[i] as ModuleId
        moduleFactories.set(moduleId, moduleFactoryFn)
      }
    }
    i = end + 1 // end is pointing at the last factory advance to the next id or the end of the array.
  }
}

// everything below is adapted from webpack
// https://github.com/webpack/webpack/blob/6be4065ade1e252c1d8dcba4af0f43e32af1bdc1/lib/runtime/AsyncModuleRuntimeModule.js#L13

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

function resolveQueue(queue?: AsyncQueue) {
  if (queue && queue.status !== QueueStatus.Resolved) {
    queue.status = QueueStatus.Resolved
    queue.forEach((fn) => fn.queueCount--)
    queue.forEach((fn) => (fn.queueCount-- ? fn.queueCount++ : fn()))
  }
}

type Dep = Exports | AsyncModulePromise | Promise<Exports>

type AsyncModuleExt = {
  [turbopackQueues]: (fn: (queue: AsyncQueue) => void) => void
  [turbopackExports]: Exports
  [turbopackError]?: any
}

type AsyncModulePromise<T = Exports> = Promise<T> & AsyncModuleExt

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

/**
 * A pseudo "fake" URL object to resolve to its relative path.
 *
 * When UrlRewriteBehavior is set to relative, calls to the `new URL()` will construct url without base using this
 * runtime function to generate context-agnostic urls between different rendering context, i.e ssr / client to avoid
 * hydration mismatch.
 *
 * This is based on webpack's existing implementation:
 * https://github.com/webpack/webpack/blob/87660921808566ef3b8796f8df61bd79fc026108/lib/runtime/RelativeUrlRuntimeModule.js
 */
const relativeURL = function relativeURL(this: any, inputUrl: string) {
  const realUrl = new URL(inputUrl, 'x:/')
  const values: Record<string, any> = {}
  for (const key in realUrl) values[key] = (realUrl as any)[key]
  values.href = inputUrl
  values.pathname = inputUrl.replace(/[?#].*/, '')
  values.origin = values.protocol = ''
  values.toString = values.toJSON = (..._args: Array<any>) => inputUrl
  for (const key in values)
    Object.defineProperty(this, key, {
      enumerable: true,
      configurable: true,
      value: values[key],
    })
}
relativeURL.prototype = URL.prototype
contextPrototype.U = relativeURL

/**
 * Utility function to ensure all variants of an enum are handled.
 */
function invariant(never: never, computeMessage: (arg: any) => string): never {
  throw new Error(`Invariant: ${computeMessage(never)}`)
}

/**
 * A stub function to make `require` available but non-functional in ESM.
 */
function requireStub(_moduleId: ModuleId): never {
  throw new Error('dynamic usage of require is not supported')
}
contextPrototype.z = requireStub

// Make `globalThis` available to the module in a way that cannot be shadowed by a local variable.
contextPrototype.g = globalThis

type ContextConstructor<M> = {
  new (module: Module, exports: Exports): TurbopackBaseContext<M>
}

function applyModuleFactoryName(factory: Function) {
  // Give the module factory a nice name to improve stack traces.
  Object.defineProperty(factory, 'name', {
    value: 'module evaluation',
  })
}
