/**
 * This file contains runtime types and functions that are shared between all
 * TurboPack ECMAScript runtimes.
 *
 * It will be prepended to the runtime code of each runtime.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="./runtime-types.d.ts" />
/// <reference path="./async-module.ts" />

type EsmNamespaceObject = Record<string, any>

/**
 * Describes why a module was instantiated.
 * Shared between browser and Node.js runtimes.
 */
enum SourceType {
  /**
   * The module was instantiated because it was included in an evaluated chunk's
   * runtime.
   * SourceData is a ChunkPath.
   */
  Runtime = 0,
  /**
   * The module was instantiated because a parent module imported it.
   * SourceData is a ModuleId.
   */
  Parent = 1,
  /**
   * The module was instantiated because it was included in a chunk's hot module
   * update.
   * SourceData is an array of ModuleIds or undefined.
   */
  Update = 2,
}

type SourceData = ChunkPath | ModuleId | ModuleId[] | undefined

// @ts-ignore Defined in `dev-base.ts`
declare function getOrInstantiateModuleFromParent<M>(
  id: ModuleId,
  sourceModule: M
): M

// @ts-ignore Defined in `hmr-runtime.ts` (dev mode only)
declare let devModuleCache: Record<ModuleId, any> | undefined

/**
 * Flag indicating which module object type to create when a module is merged. Set to `true`
 * by each runtime that uses ModuleWithDirection (browser dev-base.ts, nodejs dev-base.ts,
 * nodejs build-base.ts). Browser production (build-base.ts) leaves it as `false` since it
 * uses plain Module objects.
 */
let createModuleWithDirectionFlag = false

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
  (moduleId: string): Exports | EsmNamespaceObject

  // async import call
  import(moduleId: string): Promise<Exports | EsmNamespaceObject>

  keys(): ModuleId[]

  resolve(moduleId: string): ModuleId
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
    if (createModuleWithDirectionFlag) {
      // set in development modes for hmr support
      module = createModuleWithDirection(id)
    } else {
      module = createModuleObject(id)
    }
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

function createModuleWithDirection(id: ModuleId): ModuleWithDirection {
  return {
    exports: {},
    error: undefined,
    id,
    namespaceObject: undefined,
    parents: [],
    children: [],
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
 * Terminates a module's group of entries in an {@link EsmReexports} list.
 */
const REEXPORT_GROUP_END = 0

/**
 * Adds the getters to the exports object.
 */
function esm(exports: Exports, bindings: EsmBindings, dynamic?: boolean) {
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
  // The properties defined above are already non-configurable and
  // non-writable, so the namespace's existing exports are effectively
  // immutable. Sealing additionally makes the object non-extensible, matching
  // real ESM-namespace semantics. Modules with dynamic re-exports
  // (`export *` from a CommonJS module) must stay extensible so the dynamic
  // export proxy can surface keys discovered at runtime, so skip the seal for
  // them.
  if (!dynamic) Object.seal(exports)
}

/**
 * Makes the module an ESM with exports
 */
function esmExport(
  this: TurbopackBaseContext<Module>,
  bindings: EsmBindings,
  id: ModuleId | undefined,
  dynamic?: boolean
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
  esm(exports, bindings, dynamic)
}
contextPrototype.s = esmExport

/**
 * Registers re-exports that all forward to properties of other modules.
 *
 * This is a compact spelling of the pattern
 *
 * ```js
 * var ns = context.i(moduleId)
 * context.s([exportName, () => ns[importedName], ...])
 * ```
 *
 * The list is a flat sequence of groups. Each group starts with the source the exports come from,
 * followed by that group's entries, and is terminated by the `0` sentinel (or the end of the list).
 *
 * The group head is either a **module id**, which is instantiated here:
 *
 * ```js
 * context.S([
 *   76061, 'default', 'f', 'named', 'A', 0,
 *   29842, 'otherModule', 'f',
 * ])
 * ```
 *
 * or the **namespace object** of a module that has already been imported, which is used directly:
 *
 * ```js
 * var ns1 = context.i(76061)
 * context.S([ns1, 'default', 'f', 'named', 'A'])
 * ```
 *
 * The producer picks the namespace form when it has generated the import anyway -- because some
 * later import must not be reordered past it -- so nothing is instantiated twice. The two are told
 * apart by type: a namespace object is always an object, a module id never is.
 *
 * Entries are `exportName, importedName` pairs, except when a group holds exactly one string. That
 * string is then a comma-joined list of the same pairs, which saves the repeated quoting:
 *
 * ```js
 * context.S([
 *   76061, 'default,f,named,A', 0,
 *   29842, 'otherModule,f',
 * ])
 * ```
 *
 * The producer only picks that spelling when no name contains a comma, since the names are recovered
 * by splitting on it.
 *
 * Groups whose head is a module id are instantiated in list order, at the point where the call
 * appears, so the producer must not merge such a group across an import of another module.
 *
 * `id` names the module the exports belong to when this module was merged into a scope-hoisting
 * group, exactly as it does for {@link EsmExport}.
 */
function esmReexport(
  this: TurbopackBaseContext<Module>,
  list: EsmReexports,
  id?: ModuleId
): void {
  const bindings: EsmBindings = []
  let i = 0
  while (i < list.length) {
    const head = list[i++]
    const start = i
    while (i < list.length && list[i] !== REEXPORT_GROUP_END) i++
    const entries = list.slice(start, i) as string[]
    // Skip the sentinel, if this group was terminated by one rather than by the end of the list.
    i++

    // An already-imported namespace is passed as an object; a module id never is, so the type is
    // enough to tell them apart. `esmImport` may return a promise for an async module, but
    // re-exports of async modules keep going through `context.s`, so the producer never routes them
    // here and this stays synchronous.
    const namespace = (
      typeof head === 'object' && head !== null
        ? head
        : // `EsmImport` declares an `allowExportDefault` parameter that `esmImport` itself does not
          // take (it belongs to `interopEsm`), and generated code calls `context.i(id)` with one
          // argument. Passed here only to satisfy the declared type.
          this.i(head as ModuleId, false)
    ) as Record<string, unknown>
    const pairs =
      entries.length === 1 ? entries[0].split(',') : (entries as string[])
    for (let j = 0; j < pairs.length; j += 2) {
      const importedName = pairs[j + 1]
      bindings.push(pairs[j], () => namespace[importedName])
    }
  }
  esmExport.call(this, bindings, id)
}
contextPrototype.S = esmReexport

type ReexportedObjects = Record<PropertyKey, unknown>[]
function ensureDynamicExports(
  module: Module,
  exports: Exports
): ReexportedObjects {
  let reexportedObjects: ReexportedObjects | undefined =
    REEXPORTED_OBJECTS.get(module)

  if (!reexportedObjects) {
    REEXPORTED_OBJECTS.set(module, (reexportedObjects = []))
    // Returns the re-exported object that provides `prop` as an own property,
    // or `undefined` if none does. The traps share this logic so they always
    // agree on which keys are synthesized from `reexportedObjects`. `default`
    // is never re-exported by `export *`, so it is never synthesized.
    const reexportOwning = (prop: PropertyKey) => {
      if (prop !== 'default') {
        for (const obj of reexportedObjects!) {
          if (hasOwnProperty.call(obj, prop)) return obj
        }
      }
      return undefined
    }
    // Modules with dynamic re-exports are not sealed by `esm()`, so the
    // target beneath the namespace stays extensible. That is what lets the
    // `ownKeys` and `getOwnPropertyDescriptor` traps legally report keys that
    // exist on `reexportedObjects` but not on the target itself.
    module.exports = module.namespaceObject = new Proxy(exports, {
      get(target, prop) {
        if (
          hasOwnProperty.call(target, prop) ||
          prop === 'default' ||
          prop === '__esModule'
        ) {
          return Reflect.get(target, prop)
        }
        const obj = reexportOwning(prop)
        return obj && Reflect.get(obj, prop)
      },
      // The namespace is read-only, like a real esm namespace object. The
      // re-exported modules can still mutate their own exports (exposed live
      // via `get`), but mutating the namespace itself is rejected. Refusing
      // here, rather than forwarding to the extensible target, also prevents an
      // assignment/definition from shadowing a dynamic re-export. It also
      // prevents delete from removing a static export.
      set() {
        return false
      },
      defineProperty() {
        return false
      },
      deleteProperty() {
        return false
      },
      // The `has` trap ensures that `'exportName' in starImports` will reflect
      // the truth of whether a key is exported.
      has(target, prop) {
        if (Reflect.has(target, prop)) return true
        if (prop === 'default' || prop === '__esModule') return false
        return reexportOwning(prop) !== undefined
      },
      // ownKeys and getOwnPropertyDescriptor together make the keys enumerable.
      // If a value is returned from `ownKeys` but its property descriptor is
      // not enumerable, it will not be visible to iterator methods.
      // Collectively, they allow code like the following:
      //
      // ```
      // // module.js re-exports dynamic CJS exports
      // export * from './legacyModule.cjs'
      //
      // // from another JS file, reference the re-exported dynamic values
      // import * as Namespace from './module.js'
      // Object.keys(Namespace)
      // ```
      ownKeys(target) {
        const keys = Reflect.ownKeys(target)
        for (const obj of reexportedObjects!) {
          for (const key of Reflect.ownKeys(obj)) {
            if (key !== 'default' && !keys.includes(key)) keys.push(key)
          }
        }
        return keys
      },
      getOwnPropertyDescriptor(target, prop) {
        const own = Reflect.getOwnPropertyDescriptor(target, prop)
        if (own || prop === 'default' || prop === '__esModule') return own
        const obj = reexportOwning(prop)
        if (obj) {
          // Synthetic keys don't exist on the target, so they MUST be
          // reported as configurable. However the set/delete traps above will
          // prevent them from actually being changed
          return {
            enumerable: true,
            configurable: true,
            get: () => Reflect.get(obj, prop),
          }
        }
        return undefined
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
 * Remove fragments and query parameters since they are never part of the context map keys
 *
 * This matches how we parse patterns at resolving time.  Arguably we should only do this for
 * strings passed to `import` but the resolve does it for `import` and `require` and so we do
 * here as well.
 */
function parseRequest(request: string): string {
  // Per the URI spec fragments can contain `?` characters, so we should trim it off first
  // https://datatracker.ietf.org/doc/html/rfc3986#section-3.5
  const hashIndex = request.indexOf('#')
  if (hashIndex !== -1) {
    request = request.substring(0, hashIndex)
  }

  const queryIndex = request.indexOf('?')
  if (queryIndex !== -1) {
    request = request.substring(0, queryIndex)
  }

  return request
}
/**
 * `require.context` and require/import expression runtime.
 */
function moduleContext(map: ModuleContextMap): ModuleContext {
  function moduleContext(id: string): Exports {
    id = parseRequest(id)
    if (hasOwnProperty.call(map, id)) {
      return map[id].module()
    }

    const e = new Error(`Cannot find module '${id}'`)
    ;(e as any).code = 'MODULE_NOT_FOUND'
    throw e
  }

  moduleContext.keys = (): string[] => {
    return Object.keys(map)
  }

  moduleContext.resolve = (id: string): ModuleId => {
    id = parseRequest(id)
    if (hasOwnProperty.call(map, id)) {
      return map[id].id()
    }

    const e = new Error(`Cannot find module '${id}'`)
    ;(e as any).code = 'MODULE_NOT_FOUND'
    throw e
  }

  moduleContext.import = async (id: string) => {
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

// Load the CompressedModuleFactories of a chunk into the `moduleFactories` Map.
// Factories are usually stored in one flat array. Chunks with enough strict
// factories append those as a nested array after the flat non-strict factories.
function installCompressedModuleFactories(
  chunkModules: CompressedModuleFactories,
  offset: number,
  moduleFactories: ModuleFactories,
  newModuleId?: (id: ModuleId) => void
) {
  const strictFactories = chunkModules[chunkModules.length - 1]
  const flatFactoriesEnd = Array.isArray(strictFactories)
    ? chunkModules.length - 1
    : chunkModules.length

  installFlatModuleFactories(
    chunkModules as FlatCompressedModuleFactories,
    offset,
    flatFactoriesEnd,
    moduleFactories,
    newModuleId
  )
  if (Array.isArray(strictFactories)) {
    installFlatModuleFactories(
      strictFactories,
      0,
      strictFactories.length,
      moduleFactories,
      newModuleId
    )
  }
}

// The flat format alternates one or more module IDs with their factory function.
// Walking this is a little complex, but the structure is fast to traverse and
// `typeof` distinguishes module IDs from factories.
function installFlatModuleFactories(
  chunkModules: FlatCompressedModuleFactories,
  offset: number,
  end: number,
  moduleFactories: ModuleFactories,
  newModuleId?: (id: ModuleId) => void
) {
  let i = offset
  while (i < end) {
    let factoryIndex = i + 1
    // Find our factory function
    while (
      factoryIndex < end &&
      typeof chunkModules[factoryIndex] !== 'function'
    ) {
      factoryIndex++
    }
    if (factoryIndex === end) {
      throw new Error('malformed chunk format, expected a factory function')
    }

    // Install the factory for each module ID that doesn't already have one.
    // When some IDs in this group already have a factory, reuse that existing
    // group factory for the missing IDs to keep all IDs in the group consistent.
    // Otherwise, install the factory from this chunk.
    const moduleFactoryFn = chunkModules[factoryIndex] as Function
    let existingGroupFactory: Function | undefined = undefined
    for (let j = i; j < factoryIndex; j++) {
      const id = chunkModules[j] as ModuleId
      const existingFactory = moduleFactories.get(id)
      if (existingFactory) {
        existingGroupFactory = existingFactory
        break
      }
    }
    const factoryToInstall = existingGroupFactory ?? moduleFactoryFn

    let didInstallFactory = false
    for (let j = i; j < factoryIndex; j++) {
      const id = chunkModules[j] as ModuleId
      if (!moduleFactories.has(id)) {
        if (!didInstallFactory) {
          if (factoryToInstall === moduleFactoryFn) {
            applyModuleFactoryName(moduleFactoryFn)
          }
          didInstallFactory = true
        }
        moduleFactories.set(id, factoryToInstall)
        newModuleId?.(id)
      }
    }
    i = factoryIndex + 1
  }
}

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
 * Constructs an error message for when a module factory is not available.
 */
function factoryNotAvailableMessage(
  moduleId: ModuleId,
  sourceType: SourceType,
  sourceData: SourceData
): string {
  let instantiationReason: string
  switch (sourceType) {
    case SourceType.Runtime:
      instantiationReason = `as a runtime entry of chunk ${sourceData}`
      break
    case SourceType.Parent:
      instantiationReason = `because it was required from module ${sourceData}`
      break
    case SourceType.Update:
      instantiationReason = 'because of an HMR update'
      break
    default:
      invariant(
        sourceType,
        (sourceType) => `Unknown source type: ${sourceType}`
      )
  }
  return `Module ${moduleId} was instantiated ${instantiationReason}, but the module factory is not available.`
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
