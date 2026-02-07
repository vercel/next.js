declare const __turbopack_external_require__: {
  resolve: (name: string, opt?: { paths: string[] }) => string
} & ((id: string, thunk: () => any, esm?: boolean) => any)

import type { Channel as Ipc } from '../types'
import { dirname, resolve as pathResolve, relative } from 'path'
import {
  StackFrame,
  parse as parseStackTrace,
} from '../compiled/stacktrace-parser'
import { structuredError, type StructuredError } from '../error'
import {
  fromPath,
  getReadEnvVariables,
  toPath,
  type TransformIpc,
} from './transforms'
import fs from 'fs'
import path from 'path'

export type IpcInfoMessage =
  | {
      type: 'dependencies'
      envVariables?: string[]
      directories?: Array<[string, string]>
      filePaths?: string[]
      buildFilePaths?: string[]
    }
  | {
      type: 'emittedError'
      severity: 'warning' | 'error'
      error: StructuredError
    }
  | {
      type: 'log'
      logs: Array<{
        time: number
        logType: string
        args: any[]
        trace?: StackFrame[]
      }>
    }

export type IpcRequestMessage =
  | {
      type: 'resolve'
      options: any
      lookupPath: string
      request: string
    }
  | {
      type: 'importModule'
      lookupPath: string
      request: string
    }

type LoaderConfig =
  | string
  | {
      loader: string
      options: { [k: string]: unknown }
    }

const {
  runLoaders,
}: typeof import('loader-runner') = require('@vercel/turbopack/loader-runner')

const contextDir = process.cwd()

const LogType = Object.freeze({
  error: 'error',
  warn: 'warn',
  info: 'info',
  log: 'log',
  debug: 'debug',

  trace: 'trace',

  group: 'group',
  groupCollapsed: 'groupCollapsed',
  groupEnd: 'groupEnd',

  profile: 'profile',
  profileEnd: 'profileEnd',

  time: 'time',

  clear: 'clear',
  status: 'status',
})

const loaderFlag = 'LOADER_EXECUTION'

const cutOffByFlag = (stack: string, flag: string): string => {
  const errorStack = stack.split('\n')
  for (let i = 0; i < errorStack.length; i++) {
    if (errorStack[i].includes(flag)) {
      errorStack.length = i
    }
  }
  return errorStack.join('\n')
}

/**
 * @param stack stack trace
 * @returns stack trace without the loader execution flag included
 */
const cutOffLoaderExecution = (stack: string): string =>
  cutOffByFlag(stack, loaderFlag)

class DummySpan {
  traceChild() {
    return new DummySpan()
  }

  traceFn<T>(fn: (span: DummySpan) => T): T {
    return fn(this)
  }

  async traceAsyncFn<T>(fn: (span: DummySpan) => T | Promise<T>): Promise<T> {
    return await fn(this)
  }

  stop() {
    return
  }
}

type ResolveOptions = {
  dependencyType?: string
  alias?: Record<string, string[]> | unknown[]
  aliasFields?: string[]
  cacheWithContext?: boolean
  conditionNames?: string[]
  descriptionFiles?: string[]
  enforceExtension?: boolean
  extensionAlias: Record<string, string[]>
  extensions?: string[]
  fallback?: Record<string, string[]>
  mainFields?: string[]
  mainFiles?: string[]
  exportsFields?: string[]
  modules?: string[]
  plugins?: unknown[]
  symlinks?: boolean
  unsafeCache?: boolean
  useSyncFileSystemCalls?: boolean
  preferRelative?: boolean
  preferAbsolute?: boolean
  restrictions?: unknown[]
  roots?: string[]
  importFields?: string[]
}

const transform = (
  ipc: TransformIpc,
  content: string | { binary: string },
  name: string,
  query: string,
  loaders: LoaderConfig[],
  sourceMap: boolean
) => {
  return new Promise((resolve, reject) => {
    const resource = pathResolve(contextDir, name)
    const resourceDir = dirname(resource)

    const loadersWithOptions = loaders.map((loader) =>
      typeof loader === 'string' ? { loader, options: {} } : loader
    )

    const logs: Array<{
      time: number
      logType: string
      args: unknown[]
      trace: StackFrame[] | undefined
    }> = []

    runLoaders(
      {
        resource: resource + query,
        context: {
          _module: {
            // For debugging purpose, if someone find context is not full compatible to
            // webpack they can guess this comes from turbopack
            __reserved: 'TurbopackContext',
          },
          currentTraceSpan: new DummySpan(),
          rootContext: contextDir,
          sourceMap,
          getOptions() {
            const entry = this.loaders[this.loaderIndex]
            return entry.options && typeof entry.options === 'object'
              ? entry.options
              : {}
          },
          fs: {
            readFile(p: string, optionsOrCb: any, maybeCb: any) {
              ipc
                .sendRequest({
                  type: 'trackFileRead',
                  file: relative(contextDir, pathResolve(p)),
                })
                .then(
                  () => {
                    fs.readFile(p, optionsOrCb, maybeCb)
                  },
                  (err) => {
                    ipc.sendError(err)
                    // sendError is going to stop the process, no need to call callback
                  }
                )
            },
          },
          getResolve: (options: ResolveOptions) => {
            const rustOptions = {
              aliasFields: undefined as undefined | string[],
              conditionNames: undefined as undefined | string[],
              noPackageJson: false,
              extensions: undefined as undefined | string[],
              mainFields: undefined as undefined | string[],
              noExportsField: false,
              mainFiles: undefined as undefined | string[],
              noModules: false,
              preferRelative: false,
            }
            if (options.alias) {
              if (!Array.isArray(options.alias) || options.alias.length > 0) {
                throw new Error('alias resolve option is not supported')
              }
            }
            if (options.aliasFields) {
              if (!Array.isArray(options.aliasFields)) {
                throw new Error('aliasFields resolve option must be an array')
              }
              rustOptions.aliasFields = options.aliasFields
            }
            if (options.conditionNames) {
              if (!Array.isArray(options.conditionNames)) {
                throw new Error(
                  'conditionNames resolve option must be an array'
                )
              }
              rustOptions.conditionNames = options.conditionNames
            }
            if (options.descriptionFiles) {
              if (
                !Array.isArray(options.descriptionFiles) ||
                options.descriptionFiles.length > 0
              ) {
                throw new Error(
                  'descriptionFiles resolve option is not supported'
                )
              }
              rustOptions.noPackageJson = true
            }
            if (options.extensions) {
              if (!Array.isArray(options.extensions)) {
                throw new Error('extensions resolve option must be an array')
              }
              rustOptions.extensions = options.extensions
            }
            if (options.mainFields) {
              if (!Array.isArray(options.mainFields)) {
                throw new Error('mainFields resolve option must be an array')
              }
              rustOptions.mainFields = options.mainFields
            }
            if (options.exportsFields) {
              if (
                !Array.isArray(options.exportsFields) ||
                options.exportsFields.length > 0
              ) {
                throw new Error('exportsFields resolve option is not supported')
              }
              rustOptions.noExportsField = true
            }
            if (options.mainFiles) {
              if (!Array.isArray(options.mainFiles)) {
                throw new Error('mainFiles resolve option must be an array')
              }
              rustOptions.mainFiles = options.mainFiles
            }
            if (options.modules) {
              if (
                !Array.isArray(options.modules) ||
                options.modules.length > 0
              ) {
                throw new Error('modules resolve option is not supported')
              }
              rustOptions.noModules = true
            }
            if (options.restrictions) {
              // TODO This is ignored for now
            }
            if (options.dependencyType) {
              // TODO This is ignored for now
            }
            if (options.preferRelative) {
              if (typeof options.preferRelative !== 'boolean') {
                throw new Error(
                  'preferRelative resolve option must be a boolean'
                )
              }
              rustOptions.preferRelative = options.preferRelative
            }
            return (
              lookupPath: string,
              request: string,
              callback?: (err?: Error, result?: string) => void
            ) => {
              if (path.isAbsolute(request)) {
                // Relativize absolute requests. Turbopack disallow them in JS code, but here it's
                // generated programatically and there is a smaller problem of
                // non-cacheable/non-portable builds.
                request = path.relative(lookupPath, request)

                // On Windows, the path might be still absolute if it's on a different drive. Just
                // let the resolver throw the error in that case.
                if (
                  !path.isAbsolute(request) &&
                  request.split(path.sep)[0] !== '..'
                ) {
                  request = './' + request
                }
              }

              const promise = ipc
                .sendRequest({
                  type: 'resolve',
                  options: rustOptions,
                  lookupPath: toPath(lookupPath),
                  request,
                })
                .then((unknownResult) => {
                  let result = unknownResult as { path: string }
                  if (result && typeof result.path === 'string') {
                    return fromPath(result.path)
                  } else {
                    throw Error(
                      'Expected { path: string } from resolve request'
                    )
                  }
                })
              if (callback) {
                promise
                  .then(
                    (result) => callback(undefined, result),
                    (err) => callback(err)
                  )
                  .catch((err) => {
                    ipc.sendError(err)
                  })
              } else {
                return promise
              }
            }
          },
          emitWarning: makeErrorEmitter('warning', ipc),
          emitError: makeErrorEmitter('error', ipc),
          importModule(
            request: string,
            optionsOrCallback?: any,
            maybeCallback?: (err: Error | null, result?: any) => void
          ) {
            // Support both (request, options, callback) and (request, options) -> Promise
            let callback:
              | ((err: Error | null, result?: any) => void)
              | undefined
            if (typeof optionsOrCallback === 'function') {
              callback = optionsOrCallback
            } else {
              callback = maybeCallback
            }

            const doImport = async () => {
              let actualRequest = request
              if (path.isAbsolute(request)) {
                actualRequest = path.relative(resourceDir, request)
                if (
                  !path.isAbsolute(actualRequest) &&
                  actualRequest.split(path.sep)[0] !== '..'
                ) {
                  actualRequest = './' + actualRequest
                }
              }

              const result = (await ipc.sendRequest({
                type: 'importModule',
                lookupPath: toPath(resourceDir),
                request: actualRequest,
              })) as {
                entryId: string
                modules: Array<{
                  id: string
                  code: string
                  sourceMap?: string
                  moduleAndExports: boolean
                }>
              }

              // Build a mini Turbopack runtime to execute the compiled
              // module code, similar to webpack's executeModule.
              const vm = require('vm')
              const nodeUrl = require('url')

              type ModuleObj = {
                exports: any
                error: any
                id: string
                namespaceObject: any
              }

              // Module cache and factory map
              const moduleCache = new Map<string, ModuleObj>()
              const moduleFactories = new Map<
                string,
                { factory: Function; moduleAndExports: boolean }
              >()

              // Map from exported asset URLs to the module IDs that
              // produced them (populated by ctx.q)
              const urlToModuleId = new Map<string, string>()

              // Resolve a [project]-relative path to an absolute
              // filesystem path. The module ID contains a path
              // relative to Turbopack's project root which may be
              // an ancestor of contextDir (process.cwd()).
              function resolveProjectPath(
                relPath: string
              ): string {
                const fs = require('fs')
                let candidate = path.resolve(
                  contextDir,
                  relPath
                )
                if (fs.existsSync(candidate)) return candidate
                let dir = contextDir
                while (true) {
                  const parent = path.dirname(dir)
                  if (parent === dir) break
                  candidate = path.resolve(parent, relPath)
                  if (fs.existsSync(candidate))
                    return candidate
                  dir = parent
                }
                throw new Error(
                  `importModule: cannot resolve project path: ${relPath}`
                )
              }

              // Compile all module factories
              for (const mod of result.modules) {
                const factoryCode = mod.moduleAndExports
                  ? `(function(__turbopack_context__, module, exports) {\n${mod.code}\n})`
                  : `(function(__turbopack_context__) {\n${mod.code}\n})`
                const factory = vm.runInThisContext(factoryCode, {
                  filename: mod.id,
                })
                moduleFactories.set(mod.id, {
                  factory,
                  moduleAndExports: mod.moduleAndExports,
                })
              }

              // ESM helpers
              function defineProp(
                obj: any,
                name: string,
                options: PropertyDescriptor
              ) {
                if (!Object.prototype.hasOwnProperty.call(obj, name)) {
                  Object.defineProperty(obj, name, options)
                }
              }

              function esmBindings(
                exports: any,
                bindings: any[]
              ) {
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
                    if (
                      i < bindings.length &&
                      typeof bindings[i] === 'function'
                    ) {
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

              function interopEsm(
                raw: any,
                allowExportDefault?: boolean
              ): any {
                const ns = Object.create(null)
                defineProp(ns, '__esModule', { value: true })
                if (
                  raw &&
                  (typeof raw === 'object' || typeof raw === 'function')
                ) {
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
                  defineProp(ns, 'default', {
                    value: raw,
                    enumerable: true,
                  })
                }
                return ns
              }

              // Symbol used to track async module promises on
              // namespace/export objects so handleAsyncDependencies
              // can detect and await them.
              const ASYNC_PROMISE = Symbol('asyncPromise')

              // Instantiate a module by ID
              function instantiateModule(id: string): ModuleObj {
                const cached = moduleCache.get(id)
                if (cached) return cached

                const entry = moduleFactories.get(id)
                if (!entry) {
                  throw new Error(
                    `importModule: module not found: ${id}`
                  )
                }

                const moduleObj: ModuleObj = {
                  exports: {},
                  error: undefined,
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

                // CommonJS require
                ctx.r = (depId: string) => {
                  return instantiateModule(depId).exports
                }

                // ESM import
                ctx.i = (depId: string) => {
                  const mod = instantiateModule(depId)
                  if (mod.namespaceObject)
                    return mod.namespaceObject
                  const raw = mod.exports
                  return (mod.namespaceObject = interopEsm(
                    raw,
                    raw && raw.__esModule
                  ))
                }

                // ESM export bindings
                ctx.s = (bindings: any[], targetId?: string) => {
                  let targetModule: ModuleObj
                  let targetExports: any
                  if (targetId != null) {
                    targetModule = moduleCache.get(targetId) || {
                      exports: {},
                      error: undefined,
                      id: targetId,
                      namespaceObject: undefined,
                    }
                    if (!moduleCache.has(targetId)) {
                      moduleCache.set(targetId, targetModule)
                    }
                    targetExports = targetModule.exports
                  } else {
                    targetModule = moduleObj
                    targetExports = moduleObj.exports
                  }
                  targetModule.namespaceObject = targetExports
                  esmBindings(targetExports, bindings)
                }

                // Export value
                ctx.v = (value: any, targetId?: string) => {
                  if (targetId != null) {
                    const mod = moduleCache.get(targetId) || {
                      exports: {},
                      error: undefined,
                      id: targetId,
                      namespaceObject: undefined,
                    }
                    mod.exports = value
                    if (!moduleCache.has(targetId)) {
                      moduleCache.set(targetId, mod)
                    }
                  } else {
                    moduleObj.exports = value
                  }
                }

                // Export namespace
                ctx.n = (namespace: any, targetId?: string) => {
                  if (targetId != null) {
                    const mod = moduleCache.get(targetId) || {
                      exports: {},
                      error: undefined,
                      id: targetId,
                      namespaceObject: undefined,
                    }
                    mod.exports = mod.namespaceObject = namespace
                    if (!moduleCache.has(targetId)) {
                      moduleCache.set(targetId, mod)
                    }
                  } else {
                    moduleObj.exports = moduleObj.namespaceObject =
                      namespace
                  }
                }

                // Dynamic export
                ctx.j = (object: any) => {
                  if (
                    typeof object === 'object' &&
                    object !== null
                  ) {
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

                // External require (use __turbopack_external_require__
                // to avoid Turbopack static analysis of require())
                ctx.x = __turbopack_external_require__

                // Runtime require
                ctx.t = __turbopack_external_require__

                // Require stub (throws in ESM)
                ctx.z = () => {
                  throw new Error(
                    'dynamic usage of require is not supported'
                  )
                }

                // Export URL (for static assets and raw wasm modules)
                ctx.q = (url: string) => {
                  defineProp(moduleObj.exports, 'default', {
                    value: url,
                    enumerable: true,
                  })
                  urlToModuleId.set(url, moduleObj.id)
                }

                // Resolve module ID path (for new URL(./file,
                // import.meta.url) patterns). Returns a file:// URL
                // pointing to the original source file.
                ctx.R = (depModuleId: string) => {
                  const exported = ctx.r(depModuleId)
                  const assetUrl =
                    exported?.default ?? exported
                  const sourceModId =
                    urlToModuleId.get(assetUrl)
                  if (sourceModId) {
                    const m = sourceModId.match(
                      /^\[project\]\/(.+?)(?:\s+\[|\s+\()/
                    )
                    if (m) {
                      const absPath = resolveProjectPath(
                        m[1]
                      )
                      return nodeUrl.pathToFileURL(absPath)
                        .href
                    }
                  }
                  return assetUrl
                }

                // Load and instantiate WebAssembly asynchronously.
                // The chunkPath comes from a raw wasm module's
                // ctx.q() export.
                ctx.w = async (
                  chunkPath: string,
                  _edgeModule: any,
                  importsObj: any
                ) => {
                  const sourceModId =
                    urlToModuleId.get(chunkPath)
                  if (!sourceModId) {
                    throw new Error(
                      `importModule: wasm source not found for ${chunkPath}`
                    )
                  }
                  const m = sourceModId.match(
                    /^\[project\]\/(.+?)(?:\s+\[|\s+\()/
                  )
                  if (!m) {
                    throw new Error(
                      `importModule: cannot extract path from module ID: ${sourceModId}`
                    )
                  }
                  const absPath = resolveProjectPath(m[1])
                  const wasmBuffer = require('fs').readFileSync(
                    absPath
                  )
                  const { instance } =
                    await WebAssembly.instantiate(
                      wasmBuffer,
                      importsObj || {}
                    )
                  return instance.exports
                }

                // Async module handler. When a module has top-level
                // await or imports async dependencies, the code
                // generator wraps its body with ctx.a(). This sets
                // up a promise that tracks the module's async
                // initialization and replaces module.exports with a
                // proxy object tagged with the promise so that
                // handleAsyncDependencies can detect and await it.
                ctx.a = (
                  body: Function,
                  hasAwait: boolean
                ) => {
                  let resolvePromise!: () => void
                  let rejectPromise!: (err: any) => void
                  const asyncPromise = new Promise<void>(
                    (resolve, reject) => {
                      resolvePromise = resolve
                      rejectPromise = reject
                    }
                  )

                  // Replace module exports with a proxy object
                  // tagged with the async promise. ESM bindings
                  // (ctx.s) will define getters on this proxy,
                  // and handleAsyncDependencies will detect the
                  // ASYNC_PROMISE symbol to await completion.
                  const exportProxy = Object.create(null)
                  ;(exportProxy as any)[ASYNC_PROMISE] =
                    asyncPromise
                  moduleObj.exports = exportProxy
                  moduleObj.namespaceObject = exportProxy

                  function handleAsyncDependencies(
                    deps: any[]
                  ) {
                    const promises: Promise<void>[] = []
                    for (const dep of deps) {
                      const p =
                        dep && dep[ASYNC_PROMISE]
                      if (p) promises.push(p)
                    }
                    if (promises.length > 0) {
                      return Promise.all(promises).then(
                        () => () => deps
                      )
                    }
                    return deps
                  }

                  function asyncResult(err?: any) {
                    if (err) rejectPromise(err)
                    else resolvePromise()
                  }

                  body(handleAsyncDependencies, asyncResult)
                }

                // Dynamic import
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
                  entry.factory(
                    ctx,
                    moduleObj,
                    moduleObj.exports
                  )
                } else {
                  entry.factory(ctx)
                }

                return moduleObj
              }

              // Execute the entry module and return its exports
              const entryModule = instantiateModule(
                result.entryId
              )
              // If the module is async, wait for it to complete
              const ns =
                entryModule.namespaceObject ||
                entryModule.exports
              const asyncP = ns && ns[ASYNC_PROMISE]
              if (asyncP) {
                await asyncP
              }
              return ns
            }

            if (!callback) {
              return doImport()
            }
            doImport().then(
              (result) => callback!(null, result),
              (err) => callback!(err as Error)
            )
          },
          getLogger(name: unknown) {
            const logFn = (logType: string, ...args: unknown[]) => {
              let trace: StackFrame[] | undefined
              switch (logType) {
                case LogType.warn:
                case LogType.error:
                case LogType.trace:
                case LogType.debug:
                  trace = parseStackTrace(
                    cutOffLoaderExecution(new Error('Trace').stack!)
                      .split('\n')
                      .slice(3)
                      .join('\n')
                  )
                  break
                default:
                  // TODO: do we need to handle this?
                  break
              }
              // Batch logs messages to be sent at the end
              logs.push({
                time: Date.now(),
                logType,
                args,
                trace,
              })
            }
            let timers: Map<string, [number, number]> | undefined
            let timersAggregates: Map<string, [number, number]> | undefined

            // See https://github.com/webpack/webpack/blob/a48c34b34d2d6c44f9b2b221d7baf278d34ac0be/lib/logging/Logger.js#L8
            return {
              error: logFn.bind(this, LogType.error),
              warn: logFn.bind(this, LogType.warn),
              info: logFn.bind(this, LogType.info),
              log: logFn.bind(this, LogType.log),
              debug: logFn.bind(this, LogType.debug),
              assert: (assertion: boolean, ...args: any[]) => {
                if (!assertion) {
                  logFn(LogType.error, ...args)
                }
              },
              trace: logFn.bind(this, LogType.trace),
              clear: logFn.bind(this, LogType.clear),
              status: logFn.bind(this, LogType.status),
              group: logFn.bind(this, LogType.group),
              groupCollapsed: logFn.bind(this, LogType.groupCollapsed),
              groupEnd: logFn.bind(this, LogType.groupEnd),
              profile: logFn.bind(this, LogType.profile),
              profileEnd: logFn.bind(this, LogType.profileEnd),
              time: (label: string) => {
                timers = timers || new Map()
                timers.set(label, process.hrtime())
              },
              timeLog: (label: string) => {
                const prev = timers && timers.get(label)
                if (!prev) {
                  throw new Error(
                    `No such label '${label}' for WebpackLogger.timeLog()`
                  )
                }
                const time = process.hrtime(prev)
                logFn(LogType.time, [label, ...time])
              },
              timeEnd: (label: string) => {
                const prev = timers && timers.get(label)
                if (!prev) {
                  throw new Error(
                    `No such label '${label}' for WebpackLogger.timeEnd()`
                  )
                }
                const time = process.hrtime(prev)
                /** @type {Map<string | undefined, [number, number]>} */
                timers!.delete(label)
                logFn(LogType.time, [label, ...time])
              },
              timeAggregate: (label: string) => {
                const prev = timers && timers.get(label)
                if (!prev) {
                  throw new Error(
                    `No such label '${label}' for WebpackLogger.timeAggregate()`
                  )
                }
                const time = process.hrtime(prev)
                /** @type {Map<string | undefined, [number, number]>} */
                timers!.delete(label)
                /** @type {Map<string | undefined, [number, number]>} */
                timersAggregates = timersAggregates || new Map()
                const current = timersAggregates.get(label)
                if (current !== undefined) {
                  if (time[1] + current[1] > 1e9) {
                    time[0] += current[0] + 1
                    time[1] = time[1] - 1e9 + current[1]
                  } else {
                    time[0] += current[0]
                    time[1] += current[1]
                  }
                }
                timersAggregates.set(label, time)
              },
              timeAggregateEnd: (label: string) => {
                if (timersAggregates === undefined) return
                const time = timersAggregates.get(label)
                if (time === undefined) return
                timersAggregates.delete(label)
                logFn(LogType.time, [label, ...time])
              },
            }
          },
        },

        loaders: loadersWithOptions.map((loader) => ({
          loader: __turbopack_external_require__.resolve(loader.loader, {
            paths: [contextDir, resourceDir],
          }),
          options: loader.options,
        })),
        readResource: (_filename, callback) => {
          // TODO assuming that filename === resource, but loaders might change that
          let data =
            typeof content === 'string'
              ? Buffer.from(content, 'utf-8')
              : Buffer.from(content.binary, 'base64')
          callback(null, data)
        },
      },
      (err, result) => {
        if (logs.length) {
          ipc.sendInfo({ type: 'log', logs: logs })
          logs.length = 0
        }
        ipc.sendInfo({
          type: 'dependencies',
          envVariables: getReadEnvVariables(),
          filePaths: result.fileDependencies.map(toPath),
          directories: result.contextDependencies.map((dep) => [
            toPath(dep),
            '**',
          ]),
        })
        if (err) {
          // Resolve loader paths to include in the error message using
          // the same "(from ...)" style as webpack's format-webpack-messages.
          const loaderPathList = loadersWithOptions.map((l) => {
            try {
              return __turbopack_external_require__.resolve(l.loader, {
                paths: [contextDir, resourceDir],
              })
            } catch {
              return l.loader
            }
          })
          const loaderPaths = loaderPathList.join(', ')

          if (!(err instanceof Error)) {
            // String throws lose their stack trace, so we create a
            // synthetic one pointing at the loader.
            const wrappedErr = new Error(
              `${String(err)}\n  (from ${loaderPaths})`
            )
            wrappedErr.stack = `Error: ${String(err)}\n    at loader (${loaderPaths})`
            return reject(wrappedErr)
          }

          // Only append "(from ...)" when no loader path is already
          // visible in the stack trace, to avoid redundant noise.
          const stack = typeof err.stack === 'string' ? err.stack : ''
          if (!loaderPathList.some((p) => stack.includes(p))) {
            err.message += `\n  (from ${loaderPaths})`
          }
          return reject(err)
        }
        if (!result.result) return reject(new Error('No result from loaders'))
        const [source, map] = result.result
        const resolvedValue = {
          source: Buffer.isBuffer(source)
            ? { binary: source.toString('base64') }
            : source,
          map:
            typeof map === 'string'
              ? map
              : typeof map === 'object'
                ? JSON.stringify(map)
                : undefined,
        }
        // Delay resolution by one event loop turn to catch deferred errors
        // from loaders (e.g. unhandled Promise rejections, setTimeout throws).
        // During this delay, uncaughtException/unhandledRejection handlers can
        // fire and send the error via IPC before we send the 'end' message.
        setTimeout(() => resolve(resolvedValue), 0)
      }
    )
  })
}

export { transform as default }

function makeErrorEmitter(
  severity: 'warning' | 'error',
  ipc: Ipc<IpcInfoMessage, IpcRequestMessage>
) {
  return function (error: Error | string) {
    ipc.sendInfo({
      type: 'emittedError',
      severity: severity,
      error: structuredError(error),
    })
  }
}
