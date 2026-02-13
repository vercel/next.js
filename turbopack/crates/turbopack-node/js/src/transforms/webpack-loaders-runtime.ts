/**
 * Mini Turbopack runtime for executing compiled module code returned by the
 * `importModule` IPC handler. This is analogous to webpack's `executeModule`:
 * it takes the code-generated module factories, wires up a minimal
 * __turbopack_context__ for each module, and evaluates them to produce the
 * entry module's exports.
 */

declare const __turbopack_external_require__: {
  resolve: (name: string, opt: { paths: string[] }) => string
} & ((id: string, thunk: () => any, esm?: boolean) => any)

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import vm from 'vm'

// ── Types ──────────────────────────────────────────────────────────

export interface ImportModuleResult {
  entryId: string
  modules: Array<{
    id: string
    code: string
    sourceMap?: string
    moduleAndExports: boolean
    hasTopLevelAwait?: boolean
  }>
}

interface ModuleObj {
  exports: any
  id: string
  namespaceObject: any
}

// ── Helpers ────────────────────────────────────────────────────────

// Module IDs look like "[project]/path/to/file.ts [...]".
// Extract the relative path portion.
const MODULE_ID_PATH_RE = /^\[project\]\/(.+?)(?:\s+\[|\s+\()/

// Symbol used to tag namespace/export objects of async modules so
// that handleAsyncDependencies can detect and await them.
const ASYNC_PROMISE = Symbol('asyncPromise')

function defineProp(obj: any, name: string, descriptor: PropertyDescriptor) {
  if (!Object.hasOwn(obj, name)) {
    Object.defineProperty(obj, name, descriptor)
  }
}

function esmBindings(exports: any, bindings: any[]) {
  defineProp(exports, '__esModule', { value: true })
  let i = 0
  while (i < bindings.length) {
    const propName = bindings[i++]
    const tagOrFunction = bindings[i++]
    if (typeof tagOrFunction === 'number') {
      if (tagOrFunction === 0) {
        defineProp(exports, propName, {
          value: bindings[i++],
          enumerable: true,
          writable: false,
        })
      }
    } else {
      const getter = tagOrFunction
      if (i < bindings.length && typeof bindings[i] === 'function') {
        const setter = bindings[i++]
        defineProp(exports, propName, {
          get: getter,
          set: setter,
          enumerable: true,
        })
      } else {
        defineProp(exports, propName, {
          get: getter,
          enumerable: true,
        })
      }
    }
  }
}

function interopEsm(raw: any, allowExportDefault?: boolean): any {
  const ns = Object.create(null)
  defineProp(ns, '__esModule', { value: true })
  if (raw && (typeof raw === 'object' || typeof raw === 'function')) {
    for (const key of Object.getOwnPropertyNames(raw)) {
      defineProp(ns, key, {
        enumerable: true,
        get: () => raw[key],
      })
    }
  }
  if (
    !(
      allowExportDefault &&
      raw &&
      Object.prototype.hasOwnProperty.call(raw, 'default')
    )
  ) {
    defineProp(ns, 'default', { value: raw, enumerable: true })
  }
  return ns
}

// ── Main entry point ───────────────────────────────────────────────

/**
 * Execute a set of Turbopack-compiled module factories and return the
 * entry module's exports (or namespace object for ESM modules).
 */
export async function executeModules(
  result: ImportModuleResult,
  contextDir: string
): Promise<any> {
  // Module cache and factory map
  const moduleCache = new Map<string, ModuleObj>()
  const moduleFactories = new Map<
    string,
    { factory: Function; moduleAndExports: boolean }
  >()

  // Map from exported asset URLs to the module IDs that produced them
  // (populated by ctx.q).
  const urlToModuleId = new Map<string, string>()

  // ── Path resolution ────────────────────────────────────────────

  // Resolve a [project]-relative path to an absolute filesystem path.
  // The module ID contains a path relative to Turbopack's project root
  // which may be an ancestor of contextDir (process.cwd()).
  function resolveProjectPath(relPath: string): string {
    let candidate = path.resolve(contextDir, relPath)
    if (fs.existsSync(candidate)) return candidate
    let dir = contextDir
    while (true) {
      const parent = path.dirname(dir)
      if (parent === dir) break
      candidate = path.resolve(parent, relPath)
      if (fs.existsSync(candidate)) return candidate
      dir = parent
    }
    throw new Error(`importModule: cannot resolve project path: ${relPath}`)
  }

  // Resolve a module ID (e.g. "[project]/file.wasm [...]") to an
  // absolute filesystem path.
  function resolveModuleIdPath(moduleId: string): string {
    const m = moduleId.match(MODULE_ID_PATH_RE)
    if (!m) {
      throw new Error(
        `importModule: cannot extract path from module ID: ${moduleId}`
      )
    }
    return resolveProjectPath(m[1])
  }

  // Look up or create a module object in the cache. Used by ctx.s,
  // ctx.v, and ctx.n when targeting a foreign module ID.
  function ensureModule(id: string): ModuleObj {
    let mod = moduleCache.get(id)
    if (!mod) {
      mod = {
        exports: {},
        id,
        namespaceObject: undefined,
      }
      moduleCache.set(id, mod)
    }
    return mod
  }

  // ── Compile factories ──────────────────────────────────────────

  for (const mod of result.modules) {
    // For async modules (top-level await, wasm imports), the inner code
    // contains __turbopack_handle_async_dependencies__ / await patterns
    // but not the ctx.a() wrapper. We add the wrapper here, mirroring
    // what module_factory() does in Rust (item.rs).
    let code = mod.code
    if (mod.hasTopLevelAwait != null) {
      code =
        'return __turbopack_context__.a(async ' +
        '(__turbopack_handle_async_dependencies__, ' +
        '__turbopack_async_result__) => { try {\n' +
        code +
        '\n__turbopack_async_result__();' +
        '} catch(e) { __turbopack_async_result__(e); } }, ' +
        String(mod.hasTopLevelAwait) +
        ');'
    }
    const factoryCode = mod.moduleAndExports
      ? `(function(__turbopack_context__, module, exports) {\n${code}\n})`
      : `(function(__turbopack_context__) {\n${code}\n})`
    const factory = vm.runInThisContext(factoryCode, {
      filename: mod.id,
    })
    moduleFactories.set(mod.id, {
      factory,
      moduleAndExports: mod.moduleAndExports,
    })
  }

  // ── Module instantiation ───────────────────────────────────────

  function instantiateModule(id: string): ModuleObj {
    const cached = moduleCache.get(id)
    if (cached) return cached

    const entry = moduleFactories.get(id)
    if (!entry) {
      throw new Error(`importModule: module not found: ${id}`)
    }

    const moduleObj: ModuleObj = {
      exports: {},
      id,
      namespaceObject: undefined,
    }
    moduleCache.set(id, moduleObj)

    // Create __turbopack_context__
    const ctx: any = Object.create(null)
    ctx.m = moduleObj
    ctx.e = moduleObj.exports
    ctx.c = moduleCache
    ctx.M = moduleFactories
    ctx.g = globalThis

    // .r — CommonJS require
    ctx.r = (depId: string) => instantiateModule(depId).exports

    // .i — ESM import
    ctx.i = (depId: string) => {
      const mod = instantiateModule(depId)
      if (mod.namespaceObject) return mod.namespaceObject
      const raw = mod.exports
      return (mod.namespaceObject = interopEsm(raw, raw && raw.__esModule))
    }

    // .s — ESM export bindings
    ctx.s = (bindings: any[], targetId?: string) => {
      const target = targetId != null ? ensureModule(targetId) : moduleObj
      target.namespaceObject = target.exports
      esmBindings(target.exports, bindings)
    }

    // .v — export value
    ctx.v = (value: any, targetId?: string) => {
      const target = targetId != null ? ensureModule(targetId) : moduleObj
      target.exports = value
    }

    // .n — export namespace
    ctx.n = (namespace: any, targetId?: string) => {
      const target = targetId != null ? ensureModule(targetId) : moduleObj
      target.exports = target.namespaceObject = namespace
    }

    // .j — dynamic export
    ctx.j = (object: any) => {
      if (typeof object === 'object' && object !== null) {
        for (const key of Object.keys(object)) {
          if (key !== 'default') {
            defineProp(moduleObj.exports, key, {
              enumerable: true,
              get: () => object[key],
            })
          }
        }
      }
    }

    // .x — external require
    ctx.x = __turbopack_external_require__

    // .t — runtime require
    ctx.t = __turbopack_external_require__

    // .z — require stub (throws in ESM)
    ctx.z = () => {
      throw new Error('dynamic usage of require is not supported')
    }

    // .q — export URL (for static assets and raw wasm modules).
    // Sets module.exports to the URL string directly (matching the
    // full runtime's exportUrl → exportValue behavior).
    ctx.q = (url: string) => {
      moduleObj.exports = url
      urlToModuleId.set(url, moduleObj.id)
    }

    // .R — resolve module ID to file:// URL (for new URL() patterns)
    ctx.R = (depModuleId: string) => {
      const exported = ctx.r(depModuleId)
      const assetUrl = exported?.default ?? exported
      const sourceModId = urlToModuleId.get(assetUrl)
      if (sourceModId) {
        const absPath = resolveModuleIdPath(sourceModId)
        return pathToFileURL(absPath).href
      }
      return assetUrl
    }

    // .U — relativeURL constructor (for UrlRewriteBehavior::Relative).
    // Creates a pseudo URL object with relative path, matching the full
    // Turbopack runtime's relativeURL in runtime-utils.ts.
    ctx.U = function relativeURL(this: any, inputUrl: string) {
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
    ctx.U.prototype = URL.prototype

    // .w — async WebAssembly instantiation
    ctx.w = async (chunkPath: string, _edgeModule: any, importsObj: any) => {
      const sourceModId = urlToModuleId.get(chunkPath)
      if (!sourceModId) {
        throw new Error(`importModule: wasm source not found for ${chunkPath}`)
      }
      const absPath = resolveModuleIdPath(sourceModId)
      const wasmBuffer = fs.readFileSync(absPath)
      const { instance } = await WebAssembly.instantiate(
        wasmBuffer,
        importsObj || {}
      )
      return instance.exports
    }

    // .a — async module handler (for top-level await / async deps)
    ctx.a = (body: Function, _hasAwait: boolean) => {
      let resolvePromise!: () => void
      let rejectPromise!: (err: any) => void
      const asyncPromise = new Promise<void>((resolve, reject) => {
        resolvePromise = resolve
        rejectPromise = reject
      })

      // Replace module exports with a proxy tagged with the async
      // promise. ESM bindings (ctx.s) will define getters on it.
      const exportProxy = Object.create(null)
      exportProxy[ASYNC_PROMISE] = asyncPromise
      moduleObj.exports = exportProxy
      moduleObj.namespaceObject = exportProxy

      function handleAsyncDependencies(deps: any[]) {
        const promises: Promise<void>[] = []
        for (const dep of deps) {
          if (dep && dep[ASYNC_PROMISE]) {
            promises.push(dep[ASYNC_PROMISE])
          }
        }
        if (promises.length > 0) {
          return Promise.all(promises).then(() => () => deps)
        }
        return deps
      }

      function asyncResult(err?: any) {
        if (err) rejectPromise(err)
        else resolvePromise()
      }

      body(handleAsyncDependencies, asyncResult)
    }

    // .P — resolve absolute path (for import.meta.url)
    ctx.P = (modulePath?: string) => {
      if (modulePath) return resolveProjectPath(modulePath)
      return contextDir
    }

    // .A — async loader (for dynamic imports in production mode).
    // In the full runtime, the "async loader" is a separate chunk item.
    // In our mini runtime all modules are already available, so we
    // strip the ", async loader" suffix and do a regular dynamic import.
    ctx.A = (depId: string) => {
      if (moduleFactories.has(depId)) {
        const loader = ctx.r(depId)
        return loader(ctx.i)
      }
      const baseId = depId.replace(/, async loader\)$/, ')')
      return ctx.l(baseId)
    }

    // .l — dynamic import
    ctx.l = (depId: string) => {
      const mod = instantiateModule(depId)
      const ns =
        mod.namespaceObject ||
        (mod.namespaceObject = interopEsm(
          mod.exports,
          mod.exports && mod.exports.__esModule
        ))
      const p = ns && ns[ASYNC_PROMISE]
      if (p) return p.then(() => ns)
      return Promise.resolve(ns)
    }

    // Execute the factory
    if (entry.moduleAndExports) {
      entry.factory(ctx, moduleObj, moduleObj.exports)
    } else {
      entry.factory(ctx)
    }

    return moduleObj
  }

  // ── Execute entry module ───────────────────────────────────────

  const entryModule = instantiateModule(result.entryId)
  const ns = entryModule.namespaceObject || entryModule.exports
  if (ns && ns[ASYNC_PROMISE]) {
    await ns[ASYNC_PROMISE]
  }
  return ns
}
