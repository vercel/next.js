/* eslint-disable @typescript-eslint/no-use-before-define */
import path from 'path'
import { pathToFileURL } from 'url'
import { platform, arch } from 'os'
import { platformArchTriples } from 'next/dist/compiled/@napi-rs/triples'
import * as Log from '../output/log'
import { getParserOptions } from './options'
import { eventSwcLoadFailure } from '../../telemetry/events/swc-load-failure'
import { patchIncorrectLockfile } from '../../lib/patch-incorrect-lockfile'
import { downloadWasmSwc, downloadNativeNextSwc } from '../../lib/download-swc'
import { spawn } from 'child_process'
import { NextConfigComplete, TurboLoaderItem } from '../../server/config-shared'
import { isDeepStrictEqual } from 'util'

const nextVersion = process.env.__NEXT_VERSION as string

const ArchName = arch()
const PlatformName = platform()
const triples = platformArchTriples[PlatformName]?.[ArchName] || []

const infoLog = (...args: any[]) => {
  if (process.env.NEXT_PRIVATE_BUILD_WORKER) {
    return
  }
  Log.info(...args)
}

// Allow to specify an absolute path to the custom turbopack binary to load.
// If one of env variables is set, `loadNative` will try to use any turbo-* interfaces from specified
// binary instead. This will not affect existing swc's transform, or other interfaces. This is thin,
// naive interface - `loadBindings` will not validate neither path nor the binary.
//
// Note these are internal flag: there's no stability, feature guarantee.
const __INTERNAL_CUSTOM_TURBOPACK_BINARY =
  process.env.__INTERNAL_CUSTOM_TURBOPACK_BINARY
const __INTERNAL_CUSTOM_TURBOPACK_BINDINGS =
  process.env.__INTERNAL_CUSTOM_TURBOPACK_BINDINGS
export const __isCustomTurbopackBinary = async (): Promise<boolean> => {
  if (
    !!__INTERNAL_CUSTOM_TURBOPACK_BINARY &&
    !!__INTERNAL_CUSTOM_TURBOPACK_BINDINGS
  ) {
    throw new Error('Cannot use TURBOPACK_BINARY and TURBOPACK_BINDINGS both')
  }

  return (
    !!__INTERNAL_CUSTOM_TURBOPACK_BINARY ||
    !!__INTERNAL_CUSTOM_TURBOPACK_BINDINGS
  )
}

function checkVersionMismatch(pkgData: any) {
  const version = pkgData.version

  if (version && version !== nextVersion) {
    Log.warn(
      `Mismatching @next/swc version, detected: ${version} while Next.js is on ${nextVersion}. Please ensure these match`
    )
  }
}

// These are the platforms we'll try to load wasm bindings first,
// only try to load native bindings if loading wasm binding somehow fails.
// Fallback to native binding is for migration period only,
// once we can verify loading-wasm-first won't cause visible regressions,
// we'll not include native bindings for these platform at all.
const knownDefaultWasmFallbackTriples = [
  'aarch64-linux-android',
  'x86_64-unknown-freebsd',
  'aarch64-pc-windows-msvc',
  'arm-linux-androideabi',
  'armv7-unknown-linux-gnueabihf',
  'i686-pc-windows-msvc',
]

// The last attempt's error code returned when cjs require to native bindings fails.
// If node.js throws an error without error code, this should be `unknown` instead of undefined.
// For the wasm-first targets (`knownDefaultWasmFallbackTriples`) this will be `unsupported_target`.
let lastNativeBindingsLoadErrorCode:
  | 'unknown'
  | 'unsupported_target'
  | string
  | undefined = undefined
let nativeBindings: any
let wasmBindings: any
let downloadWasmPromise: any
let pendingBindings: any
let swcTraceFlushGuard: any
let swcHeapProfilerFlushGuard: any
let swcCrashReporterFlushGuard: any
let downloadNativeBindingsPromise: Promise<void> | undefined = undefined

export const lockfilePatchPromise: { cur?: Promise<void> } = {}

export interface Binding {
  isWasm: boolean
  turbo: {
    startDev: any
    startTrace: any
    nextBuild?: any
    createTurboTasks?: any
    entrypoints: {
      stream: any
      get: any
    }
    mdx: {
      compile: any
      compileSync: any
    }
    createProject: (
      options: ProjectOptions,
      turboEngineOptions?: TurboEngineOptions
    ) => Promise<Project>
  }
  minify: any
  minifySync: any
  transform: any
  transformSync: any
  parse: any
  parseSync: any
  getTargetTriple(): string | undefined
  initCustomTraceSubscriber?: any
  teardownTraceSubscriber?: any
  initHeapProfiler?: any
  teardownHeapProfiler?: any
  teardownCrashReporter?: any
}

export async function loadBindings(): Promise<Binding> {
  if (pendingBindings) {
    return pendingBindings
  }
  const isCustomTurbopack = await __isCustomTurbopackBinary()
  pendingBindings = new Promise(async (resolve, _reject) => {
    if (!lockfilePatchPromise.cur) {
      // always run lockfile check once so that it gets patched
      // even if it doesn't fail to load locally
      lockfilePatchPromise.cur = patchIncorrectLockfile(process.cwd()).catch(
        console.error
      )
    }

    let attempts: any[] = []
    const disableWasmFallback = process.env.NEXT_DISABLE_SWC_WASM
    const shouldLoadWasmFallbackFirst =
      !disableWasmFallback &&
      triples.some(
        (triple: any) =>
          !!triple?.raw && knownDefaultWasmFallbackTriples.includes(triple.raw)
      )

    if (shouldLoadWasmFallbackFirst) {
      lastNativeBindingsLoadErrorCode = 'unsupported_target'
      const fallbackBindings = await tryLoadWasmWithFallback(
        attempts,
        isCustomTurbopack
      )
      if (fallbackBindings) {
        return resolve(fallbackBindings)
      }
    }

    // Trickle down loading `fallback` bindings:
    //
    // - First, try to load native bindings installed in node_modules.
    // - If that fails with `ERR_MODULE_NOT_FOUND`, treat it as case of https://github.com/npm/cli/issues/4828
    // that host system where generated package lock is not matching to the guest system running on, try to manually
    // download corresponding target triple and load it. This won't be triggered if native bindings are failed to load
    // with other reasons than `ERR_MODULE_NOT_FOUND`.
    // - Lastly, falls back to wasm binding where possible.
    try {
      return resolve(loadNative(isCustomTurbopack))
    } catch (a) {
      if (
        Array.isArray(a) &&
        a.every((m) => m.includes('it was not installed'))
      ) {
        let fallbackBindings = await tryLoadNativeWithFallback(
          attempts,
          isCustomTurbopack
        )

        if (fallbackBindings) {
          return resolve(fallbackBindings)
        }
      }

      attempts = attempts.concat(a)
    }

    // For these platforms we already tried to load wasm and failed, skip reattempt
    if (!shouldLoadWasmFallbackFirst && !disableWasmFallback) {
      const fallbackBindings = await tryLoadWasmWithFallback(
        attempts,
        isCustomTurbopack
      )
      if (fallbackBindings) {
        return resolve(fallbackBindings)
      }
    }

    logLoadFailure(attempts, true)
  })
  return pendingBindings
}

async function tryLoadNativeWithFallback(
  attempts: Array<string>,
  isCustomTurbopack: boolean
) {
  const nativeBindingsDirectory = path.join(
    path.dirname(require.resolve('next/package.json')),
    'next-swc-fallback'
  )

  if (!downloadNativeBindingsPromise) {
    downloadNativeBindingsPromise = downloadNativeNextSwc(
      nextVersion,
      nativeBindingsDirectory,
      triples.map((triple: any) => triple.platformArchABI)
    )
  }
  await downloadNativeBindingsPromise

  try {
    let bindings = loadNative(isCustomTurbopack, nativeBindingsDirectory)
    return bindings
  } catch (a: any) {
    attempts.concat(a)
  }
  return undefined
}

async function tryLoadWasmWithFallback(
  attempts: any,
  isCustomTurbopack: boolean
) {
  try {
    let bindings = await loadWasm('', isCustomTurbopack)
    // @ts-expect-error TODO: this event has a wrong type.
    eventSwcLoadFailure({
      wasm: 'enabled',
      nativeBindingsErrorCode: lastNativeBindingsLoadErrorCode,
    })
    return bindings
  } catch (a) {
    attempts = attempts.concat(a)
  }

  try {
    // if not installed already download wasm package on-demand
    // we download to a custom directory instead of to node_modules
    // as node_module import attempts are cached and can't be re-attempted
    // x-ref: https://github.com/nodejs/modules/issues/307
    const wasmDirectory = path.join(
      path.dirname(require.resolve('next/package.json')),
      'wasm'
    )
    if (!downloadWasmPromise) {
      downloadWasmPromise = downloadWasmSwc(nextVersion, wasmDirectory)
    }
    await downloadWasmPromise
    let bindings = await loadWasm(
      pathToFileURL(wasmDirectory).href,
      isCustomTurbopack
    )
    // @ts-expect-error TODO: this event has a wrong type.
    eventSwcLoadFailure({
      wasm: 'fallback',
      nativeBindingsErrorCode: lastNativeBindingsLoadErrorCode,
    })

    // still log native load attempts so user is
    // aware it failed and should be fixed
    for (const attempt of attempts) {
      Log.warn(attempt)
    }
    return bindings
  } catch (a) {
    attempts = attempts.concat(a)
  }
}

function loadBindingsSync() {
  let attempts: any[] = []
  try {
    return loadNative()
  } catch (a) {
    attempts = attempts.concat(a)
  }

  // we can leverage the wasm bindings if they are already
  // loaded
  if (wasmBindings) {
    return wasmBindings
  }

  logLoadFailure(attempts)
}

let loggingLoadFailure = false

function logLoadFailure(attempts: any, triedWasm = false) {
  // make sure we only emit the event and log the failure once
  if (loggingLoadFailure) return
  loggingLoadFailure = true

  for (let attempt of attempts) {
    Log.warn(attempt)
  }

  // @ts-expect-error TODO: this event has a wrong type.
  eventSwcLoadFailure({
    wasm: triedWasm ? 'failed' : undefined,
    nativeBindingsErrorCode: lastNativeBindingsLoadErrorCode,
  })
    .then(() => lockfilePatchPromise.cur || Promise.resolve())
    .finally(() => {
      Log.error(
        `Failed to load SWC binary for ${PlatformName}/${ArchName}, see more info here: https://nextjs.org/docs/messages/failed-loading-swc`
      )
      process.exit(1)
    })
}

interface ProjectOptions {
  /**
   * A root path from which all files must be nested under. Trying to access
   * a file outside this root will fail. Think of this as a chroot.
   */
  rootPath: string

  /**
   * A path inside the root_path which contains the app/pages directories.
   */
  projectPath: string

  /**
   * The next.config.js contents.
   */
  nextConfig: NextConfigComplete

  /**
   * A map of environment variables to use when compiling code.
   */
  env: Record<string, string>

  /**
   * Whether to watch he filesystem for file changes.
   */
  watch: boolean
}

interface TurboEngineOptions {
  /**
   * An upper bound of memory that turbopack will attempt to stay under.
   */
  memoryLimit?: number
}

interface Issue {
  severity: string
  category: string
  context: string
  title: string
  description: string
  detail: string
  source?: {
    source: {
      ident: string
      content?: string
    }
    start: { line: number; column: number }
    end: { line: number; column: number }
  }
  documentationLink: string
  subIssues: Issue[]
}

interface Diagnostics {}

type TurbopackResult<T = {}> = T & {
  issues: Issue[]
  diagnostics: Diagnostics[]
}

interface Middleware {
  endpoint: Endpoint
  runtime: 'nodejs' | 'edge'
  matcher?: string[]
}

interface Entrypoints {
  routes: Map<string, Route>
  middleware?: Middleware
}

interface Project {
  update(options: ProjectOptions): Promise<void>
  entrypointsSubscribe(): AsyncIterableIterator<TurbopackResult<Entrypoints>>
}

type Route =
  | {
      type: 'conflict'
    }
  | {
      type: 'app-page'
      htmlEndpoint: Endpoint
      rscEndpoint: Endpoint
    }
  | {
      type: 'app-route'
      endpoint: Endpoint
    }
  | {
      type: 'page'
      htmlEndpoint: Endpoint
      dataEndpoint: Endpoint
    }
  | {
      type: 'page-api'
      endpoint: Endpoint
    }
  | {
      type: 'page-ssr'
      endpoint: Endpoint
    }

interface Endpoint {
  /** Write files for the endpoint to disk. */
  writeToDisk(): Promise<TurbopackResult<WrittenEndpoint>>
  /**
   * Listen to changes to the endpoint.
   * After changed() has been awaited it will listen to changes.
   * The async iterator will yield for each change.
   */
  changed(): Promise<AsyncIterableIterator<TurbopackResult>>
}

interface EndpointConfig {
  dynamic?: 'auto' | 'force-dynamic' | 'error' | 'force-static'
  dynamicParams?: boolean
  revalidate?: 'never' | 'force-cache' | number
  fetchCache?:
    | 'auto'
    | 'default-cache'
    | 'only-cache'
    | 'force-cache'
    | 'default-no-store'
    | 'only-no-store'
    | 'force-no-store'
  runtime?: 'nodejs' | 'edge'
  preferredRegion?: string
}

type WrittenEndpoint =
  | {
      type: 'nodejs'
      /** The entry path for the endpoint. */
      entryPath: string
      /** All server paths that has been written for the endpoint. */
      serverPaths: string[]
      config: EndpointConfig
    }
  | {
      type: 'edge'
      files: string[]
      /** All server paths that has been written for the endpoint. */
      serverPaths: string[]
      globalVarName: string
      config: EndpointConfig
    }

// TODO(sokra) Support wasm option.
function bindingToApi(binding: any, _wasm: boolean) {
  type NativeFunction<T> = (
    callback: (err: Error, value: T) => void
  ) => Promise<{ __napiType: 'RootTask' }>

  /**
   * Utility function to ensure all variants of an enum are handled.
   */
  function invariant(
    never: never,
    computeMessage: (arg: any) => string
  ): never {
    throw new Error(`Invariant: ${computeMessage(never)}`)
  }

  async function withErrorCause<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (nativeError: any) {
      throw new Error(nativeError.message, { cause: nativeError })
    }
  }

  /**
   * Calls a native function and streams the result.
   * If useBuffer is true, all values will be preserved, potentially buffered
   * if consumed slower than produced. Else, only the latest value will be
   * preserved.
   */
  function subscribe<T>(
    useBuffer: boolean,
    nativeFunction: NativeFunction<T>
  ): AsyncIterableIterator<T> {
    type BufferItem =
      | { err: Error; value: undefined }
      | { err: undefined; value: T }
    // A buffer of produced items. This will only contain values if the
    // consumer is slower than the producer.
    let buffer: BufferItem[] = []
    // A deferred value waiting for the next produced item. This will only
    // exist if the consumer is faster than the producer.
    let waiting:
      | {
          resolve: (value: T) => void
          reject: (error: Error) => void
        }
      | undefined

    // The native function will call this every time it emits a new result. We
    // either need to notify a waiting consumer, or buffer the new result until
    // the consumer catches up.
    const emitResult = (err: Error | undefined, value: T | undefined) => {
      if (waiting) {
        let { resolve, reject } = waiting
        waiting = undefined
        if (err) reject(err)
        else resolve(value!)
      } else {
        const item = { err, value } as BufferItem
        if (useBuffer) buffer.push(item)
        else buffer[0] = item
      }
    }

    return (async function* () {
      const task = await withErrorCause(() => nativeFunction(emitResult))
      try {
        while (true) {
          if (buffer.length > 0) {
            const item = buffer.shift()!
            if (item.err) throw item.err
            yield item.value
          } else {
            // eslint-disable-next-line no-loop-func
            yield new Promise<T>((resolve, reject) => {
              waiting = { resolve, reject }
            })
          }
        }
      } finally {
        binding.rootTaskDispose(task)
      }
    })()
  }

  async function rustifyProjectOptions(options: ProjectOptions): Promise<any> {
    return {
      ...options,
      nextConfig: await serializeNextConfig(options.nextConfig),
      env: Object.entries(options.env).map(([name, value]) => ({
        name,
        value,
      })),
    }
  }

  class ProjectImpl implements Project {
    private _nativeProject: { __napiType: 'Project' }

    constructor(nativeProject: { __napiType: 'Project' }) {
      this._nativeProject = nativeProject
    }

    async update(options: ProjectOptions) {
      await withErrorCause(async () =>
        binding.projectUpdate(
          this._nativeProject,
          await rustifyProjectOptions(options)
        )
      )
    }

    entrypointsSubscribe() {
      type NapiEndpoint = { __napiType: 'Endpoint' }

      type NapiEntrypoints = {
        routes: NapiRoute[]
        middleware?: NapiMiddleware
        issues: Issue[]
        diagnostics: Diagnostics[]
      }

      type NapiMiddleware = {
        endpoint: NapiEndpoint
        runtime: 'nodejs' | 'edge'
        matcher?: string[]
      }

      type NapiRoute = {
        pathname: string
      } & (
        | {
            type: 'page'
            htmlEndpoint: NapiEndpoint
            dataEndpoint: NapiEndpoint
          }
        | {
            type: 'page-api'
            endpoint: NapiEndpoint
          }
        | {
            type: 'page-ssr'
            endpoint: NapiEndpoint
          }
        | {
            type: 'app-page'
            htmlEndpoint: NapiEndpoint
            rscEndpoint: NapiEndpoint
          }
        | {
            type: 'app-route'
            endpoint: NapiEndpoint
          }
        | {
            type: 'conflict'
          }
      )

      const subscription = subscribe<NapiEntrypoints>(false, async (callback) =>
        binding.projectEntrypointsSubscribe(await this._nativeProject, callback)
      )
      return (async function* () {
        for await (const entrypoints of subscription) {
          const routes = new Map()
          for (const { pathname, ...nativeRoute } of entrypoints.routes) {
            let route: Route
            switch (nativeRoute.type) {
              case 'page':
                route = {
                  type: 'page',
                  htmlEndpoint: new EndpointImpl(nativeRoute.htmlEndpoint),
                  dataEndpoint: new EndpointImpl(nativeRoute.dataEndpoint),
                }
                break
              case 'page-api':
                route = {
                  type: 'page-api',
                  endpoint: new EndpointImpl(nativeRoute.endpoint),
                }
                break
              case 'page-ssr':
                route = {
                  type: 'page-ssr',
                  endpoint: new EndpointImpl(nativeRoute.endpoint),
                }
                break
              case 'app-page':
                route = {
                  type: 'app-page',
                  htmlEndpoint: new EndpointImpl(nativeRoute.htmlEndpoint),
                  rscEndpoint: new EndpointImpl(nativeRoute.rscEndpoint),
                }
                break
              case 'app-route':
                route = {
                  type: 'app-route',
                  endpoint: new EndpointImpl(nativeRoute.endpoint),
                }
                break
              case 'conflict':
                route = {
                  type: 'conflict',
                }
                break
              default:
                invariant(
                  nativeRoute,
                  () => `Unknown route type: ${(nativeRoute as any).type}`
                )
                break
            }
            routes.set(pathname, route)
          }
          const napiMiddlewareToMiddleware = (middleware: NapiMiddleware) => ({
            endpoint: new EndpointImpl(middleware.endpoint),
            runtime: middleware.runtime,
            matcher: middleware.matcher,
          })
          const middleware = entrypoints.middleware
            ? napiMiddlewareToMiddleware(entrypoints.middleware)
            : undefined
          yield {
            routes,
            middleware,
            issues: entrypoints.issues,
            diagnostics: entrypoints.diagnostics,
          }
        }
      })()
    }
  }

  class EndpointImpl implements Endpoint {
    private _nativeEndpoint: { __napiType: 'Endpoint' }

    constructor(nativeEndpoint: { __napiType: 'Endpoint' }) {
      this._nativeEndpoint = nativeEndpoint
    }

    async writeToDisk(): Promise<TurbopackResult<WrittenEndpoint>> {
      return await withErrorCause(() =>
        binding.endpointWriteToDisk(this._nativeEndpoint)
      )
    }

    async changed(): Promise<AsyncIterableIterator<TurbopackResult>> {
      const iter = subscribe<TurbopackResult>(false, async (callback) =>
        binding.endpointChangedSubscribe(await this._nativeEndpoint, callback)
      )
      await iter.next()
      return iter
    }
  }

  async function serializeNextConfig(
    nextConfig: NextConfigComplete
  ): Promise<string> {
    let nextConfigSerializable = nextConfig as any

    nextConfigSerializable.generateBuildId =
      await nextConfig.generateBuildId?.()

    // TODO: these functions takes arguments, have to be supported in a different way
    nextConfigSerializable.exportPathMap = {}
    nextConfigSerializable.webpack = nextConfig.webpack && {}

    if (nextConfig.experimental?.turbo?.loaders) {
      ensureLoadersHaveSerializableOptions(
        nextConfig.experimental.turbo.loaders
      )
    }

    return JSON.stringify(nextConfigSerializable)
  }

  function ensureLoadersHaveSerializableOptions(
    turbopackLoaders: Record<string, TurboLoaderItem[]>
  ) {
    for (const [ext, loaderItems] of Object.entries(turbopackLoaders)) {
      for (const loaderItem of loaderItems) {
        if (
          typeof loaderItem !== 'string' &&
          !isDeepStrictEqual(loaderItem, JSON.parse(JSON.stringify(loaderItem)))
        ) {
          throw new Error(
            `loader ${loaderItem.loader} for match "${ext}" does not have serializable options. Ensure that options passed are plain JavaScript objects and values.`
          )
        }
      }
    }
  }

  async function createProject(
    options: ProjectOptions,
    turboEngineOptions: TurboEngineOptions
  ) {
    return new ProjectImpl(
      await binding.projectNew(
        await rustifyProjectOptions(options),
        turboEngineOptions || {}
      )
    )
  }

  return createProject
}

async function loadWasm(importPath = '', isCustomTurbopack: boolean) {
  if (wasmBindings) {
    return wasmBindings
  }

  let attempts = []
  for (let pkg of ['@next/swc-wasm-nodejs', '@next/swc-wasm-web']) {
    try {
      let pkgPath = pkg

      if (importPath) {
        // the import path must be exact when not in node_modules
        pkgPath = path.join(importPath, pkg, 'wasm.js')
      }
      let bindings = await import(pkgPath)
      if (pkg === '@next/swc-wasm-web') {
        bindings = await bindings.default()
      }
      infoLog('Using wasm build of next-swc')

      // Note wasm binary does not support async intefaces yet, all async
      // interface coereces to sync interfaces.
      wasmBindings = {
        isWasm: true,
        transform(src: string, options: any) {
          // TODO: we can remove fallback to sync interface once new stable version of next-swc gets published (current v12.2)
          return bindings?.transform
            ? bindings.transform(src.toString(), options)
            : Promise.resolve(bindings.transformSync(src.toString(), options))
        },
        transformSync(src: string, options: any) {
          return bindings.transformSync(src.toString(), options)
        },
        minify(src: string, options: any) {
          return bindings?.minify
            ? bindings.minify(src.toString(), options)
            : Promise.resolve(bindings.minifySync(src.toString(), options))
        },
        minifySync(src: string, options: any) {
          return bindings.minifySync(src.toString(), options)
        },
        parse(src: string, options: any) {
          return bindings?.parse
            ? bindings.parse(src.toString(), options)
            : Promise.resolve(bindings.parseSync(src.toString(), options))
        },
        parseSync(src: string, options: any) {
          const astStr = bindings.parseSync(src.toString(), options)
          return astStr
        },
        getTargetTriple() {
          return undefined
        },
        turbo: {
          startDev: (options: any) => {
            if (!isCustomTurbopack) {
              Log.error('Wasm binding does not support --turbo yet')
              return
            } else if (!!__INTERNAL_CUSTOM_TURBOPACK_BINDINGS) {
              Log.warn(
                'Trying to load custom turbopack bindings. Note this is internal testing purpose only, actual wasm fallback cannot load this bindings'
              )
              Log.warn(
                `Loading custom turbopack bindings from ${__INTERNAL_CUSTOM_TURBOPACK_BINDINGS}`
              )

              const devOptions = {
                ...options,
                noOpen: options.noOpen ?? true,
              }
              require(__INTERNAL_CUSTOM_TURBOPACK_BINDINGS).startTurboDev(
                toBuffer(devOptions)
              )
            }
          },
          startTrace: () => {
            Log.error('Wasm binding does not support trace yet')
          },
          entrypoints: {
            stream: (
              turboTasks: any,
              rootDir: string,
              applicationDir: string,
              pageExtensions: string[],
              callbackFn: (err: Error, entrypoints: any) => void
            ) => {
              return bindings.streamEntrypoints(
                turboTasks,
                rootDir,
                applicationDir,
                pageExtensions,
                callbackFn
              )
            },
            get: (
              turboTasks: any,
              rootDir: string,
              applicationDir: string,
              pageExtensions: string[]
            ) => {
              return bindings.getEntrypoints(
                turboTasks,
                rootDir,
                applicationDir,
                pageExtensions
              )
            },
          },
        },
        mdx: {
          compile: (src: string, options: any) =>
            bindings.mdxCompile(src, options),
          compileSync: (src: string, options: any) =>
            bindings.mdxCompileSync(src, options),
        },
      }
      return wasmBindings
    } catch (e: any) {
      // Only log attempts for loading wasm when loading as fallback
      if (importPath) {
        if (e?.code === 'ERR_MODULE_NOT_FOUND') {
          attempts.push(`Attempted to load ${pkg}, but it was not installed`)
        } else {
          attempts.push(
            `Attempted to load ${pkg}, but an error occurred: ${e.message ?? e}`
          )
        }
      }
    }
  }

  throw attempts
}

function loadNative(isCustomTurbopack = false, importPath?: string) {
  if (nativeBindings) {
    return nativeBindings
  }

  const customBindings = !!__INTERNAL_CUSTOM_TURBOPACK_BINDINGS
    ? require(__INTERNAL_CUSTOM_TURBOPACK_BINDINGS)
    : null
  let bindings: any
  let attempts: any[] = []

  for (const triple of triples) {
    try {
      bindings = require(`@next/swc/native/next-swc.${triple.platformArchABI}.node`)
      infoLog('Using locally built binary of @next/swc')
      break
    } catch (e) {}
  }

  if (!bindings) {
    for (const triple of triples) {
      let pkg = importPath
        ? path.join(
            importPath,
            `@next/swc-${triple.platformArchABI}`,
            `next-swc.${triple.platformArchABI}.node`
          )
        : `@next/swc-${triple.platformArchABI}`
      try {
        bindings = require(pkg)
        if (!importPath) {
          checkVersionMismatch(require(`${pkg}/package.json`))
        }
        break
      } catch (e: any) {
        if (e?.code === 'MODULE_NOT_FOUND') {
          attempts.push(`Attempted to load ${pkg}, but it was not installed`)
        } else {
          attempts.push(
            `Attempted to load ${pkg}, but an error occurred: ${e.message ?? e}`
          )
        }
        lastNativeBindingsLoadErrorCode = e?.code ?? 'unknown'
      }
    }
  }

  if (bindings) {
    // Initialize crash reporter, as earliest as possible from any point of import.
    // The first-time import to next-swc is not predicatble in the import tree of next.js, which makes
    // we can't rely on explicit manual initialization as similar to trace reporter.
    if (!swcCrashReporterFlushGuard) {
      // Crash reports in next-swc should be treated in the same way we treat telemetry to opt out.
      /* TODO: temporarily disable initialization while confirming logistics.
      let telemetry = new Telemetry({ distDir: process.cwd() })
      if (telemetry.isEnabled) {
        swcCrashReporterFlushGuard = bindings.initCrashReporter?.()
      }*/
    }

    nativeBindings = {
      isWasm: false,
      transform(src: string, options: any) {
        const isModule =
          typeof src !== undefined &&
          typeof src !== 'string' &&
          !Buffer.isBuffer(src)
        options = options || {}

        if (options?.jsc?.parser) {
          options.jsc.parser.syntax = options.jsc.parser.syntax ?? 'ecmascript'
        }

        return bindings.transform(
          isModule ? JSON.stringify(src) : src,
          isModule,
          toBuffer(options)
        )
      },

      transformSync(src: string, options: any) {
        if (typeof src === undefined) {
          throw new Error(
            "transformSync doesn't implement reading the file from filesystem"
          )
        } else if (Buffer.isBuffer(src)) {
          throw new Error(
            "transformSync doesn't implement taking the source code as Buffer"
          )
        }
        const isModule = typeof src !== 'string'
        options = options || {}

        if (options?.jsc?.parser) {
          options.jsc.parser.syntax = options.jsc.parser.syntax ?? 'ecmascript'
        }

        return bindings.transformSync(
          isModule ? JSON.stringify(src) : src,
          isModule,
          toBuffer(options)
        )
      },

      minify(src: string, options: any) {
        return bindings.minify(toBuffer(src), toBuffer(options ?? {}))
      },

      minifySync(src: string, options: any) {
        return bindings.minifySync(toBuffer(src), toBuffer(options ?? {}))
      },

      parse(src: string, options: any) {
        return bindings.parse(src, toBuffer(options ?? {}))
      },

      getTargetTriple: bindings.getTargetTriple,
      initCustomTraceSubscriber: bindings.initCustomTraceSubscriber,
      teardownTraceSubscriber: bindings.teardownTraceSubscriber,
      initHeapProfiler: bindings.initHeapProfiler,
      teardownHeapProfiler: bindings.teardownHeapProfiler,
      teardownCrashReporter: bindings.teardownCrashReporter,
      turbo: {
        startDev: (options: any) => {
          initHeapProfiler()

          const devOptions = {
            ...options,
            noOpen: options.noOpen ?? true,
          }

          if (!isCustomTurbopack) {
            bindings.startTurboDev(toBuffer(devOptions))
          } else if (!!__INTERNAL_CUSTOM_TURBOPACK_BINARY) {
            console.warn(
              `Loading custom turbopack binary from ${__INTERNAL_CUSTOM_TURBOPACK_BINARY}`
            )

            return new Promise((resolve, reject) => {
              const args: any[] = []

              Object.entries(devOptions).forEach(([key, value]) => {
                let cli_key = `--${key.replace(
                  /[A-Z]/g,
                  (m) => '-' + m.toLowerCase()
                )}`
                if (key === 'dir') {
                  args.push(value)
                } else if (typeof value === 'boolean' && value === true) {
                  args.push(cli_key)
                } else if (typeof value !== 'boolean' && !!value) {
                  args.push(cli_key, value)
                }
              })

              console.warn(`Running turbopack with args: [${args.join(' ')}]`)

              let child = spawn(__INTERNAL_CUSTOM_TURBOPACK_BINARY, args, {
                stdio: 'pipe',
              })
              child.on('message', (message: any) => {
                require('console').log(message)
              })
              child.stdout.on('data', (data: any) => {
                require('console').log(data.toString())
              })
              child.stderr.on('data', (data: any) => {
                require('console').log(data.toString())
              })

              child.on('close', (code: any) => {
                if (code !== 0) {
                  reject({
                    command: `${__INTERNAL_CUSTOM_TURBOPACK_BINARY} ${args.join(
                      ' '
                    )}`,
                  })
                  return
                }
                resolve(0)
              })

              process.on('beforeExit', () => {
                if (child) {
                  console.log('Killing turbopack process')
                  child.kill()
                  child = null as any
                }
              })
            })
          } else if (!!__INTERNAL_CUSTOM_TURBOPACK_BINDINGS) {
            console.warn(
              `Loading custom turbopack bindings from ${__INTERNAL_CUSTOM_TURBOPACK_BINDINGS}`
            )
            console.warn(`Running turbopack with args: `, devOptions)

            require(__INTERNAL_CUSTOM_TURBOPACK_BINDINGS).startTurboDev(
              toBuffer(devOptions)
            )
          }
        },
        nextBuild: (options: unknown) => {
          initHeapProfiler()
          const ret = (customBindings ?? bindings).nextBuild(options)

          return ret
        },
        startTrace: (options = {}, turboTasks: unknown) => {
          initHeapProfiler()
          const ret = (customBindings ?? bindings).runTurboTracing(
            toBuffer({ exact: true, ...options }),
            turboTasks
          )
          return ret
        },
        createTurboTasks: (memoryLimit?: number): unknown =>
          bindings.createTurboTasks(memoryLimit),
        entrypoints: {
          stream: (
            turboTasks: any,
            rootDir: string,
            applicationDir: string,
            pageExtensions: string[],
            fn: (entrypoints: any) => void
          ) => {
            return (customBindings ?? bindings).streamEntrypoints(
              turboTasks,
              rootDir,
              applicationDir,
              pageExtensions,
              fn
            )
          },
          get: (
            turboTasks: any,
            rootDir: string,
            applicationDir: string,
            pageExtensions: string[]
          ) => {
            return (customBindings ?? bindings).getEntrypoints(
              turboTasks,
              rootDir,
              applicationDir,
              pageExtensions
            )
          },
        },
        createProject: bindingToApi(customBindings ?? bindings, false),
      },
      mdx: {
        compile: (src: string, options: any) =>
          bindings.mdxCompile(src, toBuffer(options ?? {})),
        compileSync: (src: string, options: any) =>
          bindings.mdxCompileSync(src, toBuffer(options ?? {})),
      },
    }
    return nativeBindings
  }

  throw attempts
}

function toBuffer(t: any) {
  return Buffer.from(JSON.stringify(t))
}

export async function isWasm(): Promise<boolean> {
  let bindings = await loadBindings()
  return bindings.isWasm
}

export async function transform(src: string, options?: any): Promise<any> {
  let bindings = await loadBindings()
  return bindings.transform(src, options)
}

export function transformSync(src: string, options?: any): any {
  let bindings = loadBindingsSync()
  return bindings.transformSync(src, options)
}

export async function minify(src: string, options: any): Promise<string> {
  let bindings = await loadBindings()
  return bindings.minify(src, options)
}

export function minifySync(src: string, options: any): string {
  let bindings = loadBindingsSync()
  return bindings.minifySync(src, options)
}

export async function parse(src: string, options: any): Promise<any> {
  let bindings = await loadBindings()
  let parserOptions = getParserOptions(options)
  return bindings
    .parse(src, parserOptions)
    .then((astStr: any) => JSON.parse(astStr))
}

export function getBinaryMetadata() {
  let bindings
  try {
    bindings = loadNative()
  } catch (e) {
    // Suppress exceptions, this fn allows to fail to load native bindings
  }

  return {
    target: bindings?.getTargetTriple?.(),
  }
}

/**
 * Initialize trace subscriber to emit traces.
 *
 */
export const initCustomTraceSubscriber = (traceFileName?: string): void => {
  if (!swcTraceFlushGuard) {
    // Wasm binary doesn't support trace emission
    let bindings = loadNative()
    swcTraceFlushGuard = bindings.initCustomTraceSubscriber(traceFileName)
  }
}

/**
 * Initialize heap profiler, if possible.
 * Note this is not available in release build of next-swc by default,
 * only available by manually building next-swc with specific flags.
 * Calling in release build will not do anything.
 */
export const initHeapProfiler = () => {
  try {
    if (!swcHeapProfilerFlushGuard) {
      let bindings = loadNative()
      swcHeapProfilerFlushGuard = bindings.initHeapProfiler()
    }
  } catch (_) {
    // Suppress exceptions, this fn allows to fail to load native bindings
  }
}

/**
 * Teardown heap profiler, if possible.
 *
 * Same as initialization, this is not available in release build of next-swc by default
 * and calling it will not do anything.
 */
export const teardownHeapProfiler = (() => {
  let flushed = false
  return (): void => {
    if (!flushed) {
      flushed = true
      try {
        let bindings = loadNative()
        if (swcHeapProfilerFlushGuard) {
          bindings.teardownHeapProfiler(swcHeapProfilerFlushGuard)
        }
      } catch (e) {
        // Suppress exceptions, this fn allows to fail to load native bindings
      }
    }
  }
})()

/**
 * Teardown swc's trace subscriber if there's an initialized flush guard exists.
 *
 * This is workaround to amend behavior with process.exit
 * (https://github.com/vercel/next.js/blob/4db8c49cc31e4fc182391fae6903fb5ef4e8c66e/packages/next/bin/next.ts#L134=)
 * seems preventing napi's cleanup hook execution (https://github.com/swc-project/swc/blob/main/crates/node/src/util.rs#L48-L51=),
 *
 * instead parent process manually drops guard when process gets signal to exit.
 */
export const teardownTraceSubscriber = (() => {
  let flushed = false
  return (): void => {
    if (!flushed) {
      flushed = true
      try {
        let bindings = loadNative()
        if (swcTraceFlushGuard) {
          bindings.teardownTraceSubscriber(swcTraceFlushGuard)
        }
      } catch (e) {
        // Suppress exceptions, this fn allows to fail to load native bindings
      }
    }
  }
})()

export const teardownCrashReporter = (() => {
  let flushed = false
  return (): void => {
    if (!flushed) {
      flushed = true
      try {
        let bindings = loadNative()
        if (swcCrashReporterFlushGuard) {
          bindings.teardownCrashReporter(swcCrashReporterFlushGuard)
        }
      } catch (e) {
        // Suppress exceptions, this fn allows to fail to load native bindings
      }
    }
  }
})()
