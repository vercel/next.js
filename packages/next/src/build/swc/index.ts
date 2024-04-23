/* eslint-disable @typescript-eslint/no-use-before-define */
import path from 'path'
import { pathToFileURL } from 'url'
import { arch, platform } from 'os'
import { platformArchTriples } from 'next/dist/compiled/@napi-rs/triples'
import * as Log from '../output/log'
import { getParserOptions } from './options'
import { eventSwcLoadFailure } from '../../telemetry/events/swc-load-failure'
import { patchIncorrectLockfile } from '../../lib/patch-incorrect-lockfile'
import { downloadNativeNextSwc, downloadWasmSwc } from '../../lib/download-swc'
import type {
  TurboRuleConfigItem,
  NextConfigComplete,
  TurboLoaderItem,
  TurboRuleConfigItemOrShortcut,
  TurboRuleConfigItemOptions,
} from '../../server/config-shared'
import { isDeepStrictEqual } from 'util'
import type { DefineEnvPluginOptions } from '../webpack/plugins/define-env-plugin'
import { getDefineEnv } from '../webpack/plugins/define-env-plugin'
import type { PageExtensions } from '../page-extensions-type'

const nextVersion = process.env.__NEXT_VERSION as string

const ArchName = arch()
const PlatformName = platform()

const infoLog = (...args: any[]) => {
  if (process.env.NEXT_PRIVATE_BUILD_WORKER) {
    return
  }
  if (process.env.DEBUG) {
    Log.info(...args)
  }
}

/**
 * Based on napi-rs's target triples, returns triples that have corresponding next-swc binaries.
 */
export const getSupportedArchTriples: () => Record<string, any> = () => {
  const { darwin, win32, linux, freebsd, android } = platformArchTriples

  return {
    darwin,
    win32: {
      arm64: win32.arm64,
      ia32: win32.ia32.filter(
        (triple: { abi: string }) => triple.abi === 'msvc'
      ),
      x64: win32.x64.filter((triple: { abi: string }) => triple.abi === 'msvc'),
    },
    linux: {
      // linux[x64] includes `gnux32` abi, with x64 arch.
      x64: linux.x64.filter(
        (triple: { abi: string }) => triple.abi !== 'gnux32'
      ),
      arm64: linux.arm64,
      // This target is being deprecated, however we keep it in `knownDefaultWasmFallbackTriples` for now
      arm: linux.arm,
    },
    // Below targets are being deprecated, however we keep it in `knownDefaultWasmFallbackTriples` for now
    freebsd: {
      x64: freebsd.x64,
    },
    android: {
      arm64: android.arm64,
      arm: android.arm,
    },
  }
}

const triples = (() => {
  const supportedArchTriples = getSupportedArchTriples()
  const targetTriple = supportedArchTriples[PlatformName]?.[ArchName]

  // If we have supported triple, return it right away
  if (targetTriple) {
    return targetTriple
  }

  // If there isn't corresponding target triple in `supportedArchTriples`, check if it's excluded from original raw triples
  // Otherwise, it is completely unsupported platforms.
  let rawTargetTriple = platformArchTriples[PlatformName]?.[ArchName]

  if (rawTargetTriple) {
    Log.warn(
      `Trying to load next-swc for target triple ${rawTargetTriple}, but there next-swc does not have native bindings support`
    )
  } else {
    Log.warn(
      `Trying to load next-swc for unsupported platforms ${PlatformName}/${ArchName}`
    )
  }

  return []
})()

// Allow to specify an absolute path to the custom turbopack binary to load.
// If one of env variables is set, `loadNative` will try to use any turbo-* interfaces from specified
// binary instead. This will not affect existing swc's transform, or other interfaces. This is thin,
// naive interface - `loadBindings` will not validate neither path nor the binary.
//
// Note these are internal flag: there's no stability, feature guarantee.
const __INTERNAL_CUSTOM_TURBOPACK_BINDINGS =
  process.env.__INTERNAL_CUSTOM_TURBOPACK_BINDINGS

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
  'x86_64-unknown-freebsd',
  'aarch64-linux-android',
  'arm-linux-androideabi',
  'armv7-unknown-linux-gnueabihf',
  'i686-pc-windows-msvc',
  // WOA targets are TBD, while current userbase is small we may support it in the future
  //'aarch64-pc-windows-msvc',
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
let downloadNativeBindingsPromise: Promise<void> | undefined = undefined

export const lockfilePatchPromise: { cur?: Promise<void> } = {}

export interface Binding {
  isWasm: boolean
  turbo: {
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
  css: {
    lightning: {
      transform(transformOptions: any): Promise<any>
      transformStyleAttr(attrOptions: any): Promise<any>
    }
  }
}

export async function loadBindings(
  useWasmBinary: boolean = false
): Promise<Binding> {
  // Increase Rust stack size as some npm packages being compiled need more than the default.
  if (!process.env.RUST_MIN_STACK) {
    process.env.RUST_MIN_STACK = '8388608'
  }

  if (pendingBindings) {
    return pendingBindings
  }

  // rust needs stdout to be blocking, otherwise it will throw an error (on macOS at least) when writing a lot of data (logs) to it
  // see https://github.com/napi-rs/napi-rs/issues/1630
  // and https://github.com/nodejs/node/blob/main/doc/api/process.md#a-note-on-process-io
  if (process.stdout._handle != null) {
    // @ts-ignore
    process.stdout._handle.setBlocking?.(true)
  }
  if (process.stderr._handle != null) {
    // @ts-ignore
    process.stderr._handle.setBlocking?.(true)
  }

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
    const unsupportedPlatform = triples.some(
      (triple: any) =>
        !!triple?.raw && knownDefaultWasmFallbackTriples.includes(triple.raw)
    )
    const isWebContainer = process.versions.webcontainer
    const shouldLoadWasmFallbackFirst =
      (!disableWasmFallback && unsupportedPlatform && useWasmBinary) ||
      isWebContainer

    if (!unsupportedPlatform && useWasmBinary) {
      Log.warn(
        `experimental.useWasmBinary is not an option for supported platform ${PlatformName}/${ArchName} and will be ignored.`
      )
    }

    if (shouldLoadWasmFallbackFirst) {
      lastNativeBindingsLoadErrorCode = 'unsupported_target'
      const fallbackBindings = await tryLoadWasmWithFallback(attempts)
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
      return resolve(loadNative())
    } catch (a) {
      if (
        Array.isArray(a) &&
        a.every((m) => m.includes('it was not installed'))
      ) {
        let fallbackBindings = await tryLoadNativeWithFallback(attempts)

        if (fallbackBindings) {
          return resolve(fallbackBindings)
        }
      }

      attempts = attempts.concat(a)
    }

    logLoadFailure(attempts, true)
  })
  return pendingBindings
}

async function tryLoadNativeWithFallback(attempts: Array<string>) {
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
    let bindings = loadNative(nativeBindingsDirectory)
    return bindings
  } catch (a: any) {
    attempts.concat(a)
  }
  return undefined
}

async function tryLoadWasmWithFallback(attempts: any) {
  try {
    let bindings = await loadWasm('')
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
    let bindings = await loadWasm(wasmDirectory)
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

export interface ProjectOptions {
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
   * Jsconfig, or tsconfig contents.
   *
   * Next.js implicitly requires to read it to support few options
   * https://nextjs.org/docs/architecture/nextjs-compiler#legacy-decorators
   * https://nextjs.org/docs/architecture/nextjs-compiler#importsource
   */
  jsConfig: {
    compilerOptions: object
  }

  /**
   * A map of environment variables to use when compiling code.
   */
  env: Record<string, string>

  defineEnv: DefineEnv

  /**
   * Whether to watch the filesystem for file changes.
   */
  watch: boolean

  /**
   * The mode in which Next.js is running.
   */
  dev: boolean
}

type RustifiedEnv = { name: string; value: string }[]

export interface DefineEnv {
  client: RustifiedEnv
  edge: RustifiedEnv
  nodejs: RustifiedEnv
}

export function createDefineEnv({
  isTurbopack,
  clientRouterFilters,
  config,
  dev,
  distDir,
  fetchCacheKeyPrefix,
  hasRewrites,
  middlewareMatchers,
}: Omit<
  DefineEnvPluginOptions,
  'isClient' | 'isNodeOrEdgeCompilation' | 'isEdgeServer' | 'isNodeServer'
>): DefineEnv {
  let defineEnv: DefineEnv = {
    client: [],
    edge: [],
    nodejs: [],
  }

  for (const variant of Object.keys(defineEnv) as (keyof typeof defineEnv)[]) {
    defineEnv[variant] = rustifyEnv(
      getDefineEnv({
        isTurbopack,
        clientRouterFilters,
        config,
        dev,
        distDir,
        fetchCacheKeyPrefix,
        hasRewrites,
        isClient: variant === 'client',
        isEdgeServer: variant === 'edge',
        isNodeOrEdgeCompilation: variant === 'nodejs' || variant === 'edge',
        isNodeServer: variant === 'nodejs',
        middlewareMatchers,
      })
    )
  }

  return defineEnv
}

export interface TurboEngineOptions {
  /**
   * An upper bound of memory that turbopack will attempt to stay under.
   */
  memoryLimit?: number
}

export type StyledString =
  | {
      type: 'text'
      value: string
    }
  | {
      type: 'code'
      value: string
    }
  | {
      type: 'strong'
      value: string
    }
  | {
      type: 'stack'
      value: StyledString[]
    }
  | {
      type: 'line'
      value: StyledString[]
    }

export interface Issue {
  severity: string
  stage: string
  filePath: string
  title: StyledString
  description?: StyledString
  detail?: StyledString
  source?: {
    source: {
      ident: string
      content?: string
    }
    range?: {
      start: {
        // 0-indexed
        line: number
        // 0-indexed
        column: number
      }
      end: {
        // 0-indexed
        line: number
        // 0-indexed
        column: number
      }
    }
  }
  documentationLink: string
  subIssues: Issue[]
}

export interface Diagnostics {
  category: string
  name: string
  payload: unknown
}

export type TurbopackResult<T = {}> = T & {
  issues: Issue[]
  diagnostics: Diagnostics[]
}

export interface Middleware {
  endpoint: Endpoint
}

export interface Instrumentation {
  nodeJs: Endpoint
  edge: Endpoint
}

export interface Entrypoints {
  routes: Map<string, Route>
  middleware?: Middleware
  instrumentation?: Instrumentation
  pagesDocumentEndpoint: Endpoint
  pagesAppEndpoint: Endpoint
  pagesErrorEndpoint: Endpoint
}

interface BaseUpdate {
  resource: {
    headers: unknown
    path: string
  }
  diagnostics: unknown[]
  issues: Issue[]
}

interface IssuesUpdate extends BaseUpdate {
  type: 'issues'
}

interface EcmascriptMergedUpdate {
  type: 'EcmascriptMergedUpdate'
  chunks: { [moduleName: string]: { type: 'partial' } }
  entries: { [moduleName: string]: { code: string; map: string; url: string } }
}

interface PartialUpdate extends BaseUpdate {
  type: 'partial'
  instruction: {
    type: 'ChunkListUpdate'
    merged: EcmascriptMergedUpdate[] | undefined
  }
}

export type Update = IssuesUpdate | PartialUpdate

export interface HmrIdentifiers {
  identifiers: string[]
}

/** @see https://github.com/vercel/next.js/blob/415cd74b9a220b6f50da64da68c13043e9b02995/packages/next-swc/crates/napi/src/next_api/project.rs#L824-L833 */
export interface TurbopackStackFrame {
  isServer: boolean
  isInternal?: boolean
  file: string
  /** 1-indexed, unlike source map tokens */
  line?: number
  /** 1-indexed, unlike source map tokens */
  column?: number | null
  methodName?: string
}

export type UpdateMessage =
  | {
      updateType: 'start'
    }
  | {
      updateType: 'end'
      value: UpdateInfo
    }

export interface UpdateInfo {
  duration: number
  tasks: number
}

export interface Project {
  update(options: Partial<ProjectOptions>): Promise<void>

  entrypointsSubscribe(): AsyncIterableIterator<TurbopackResult<Entrypoints>>

  hmrEvents(identifier: string): AsyncIterableIterator<TurbopackResult<Update>>

  hmrIdentifiersSubscribe(): AsyncIterableIterator<
    TurbopackResult<HmrIdentifiers>
  >

  getSourceForAsset(filePath: string): Promise<string | null>

  traceSource(
    stackFrame: TurbopackStackFrame
  ): Promise<TurbopackStackFrame | null>

  updateInfoSubscribe(
    aggregationMs: number
  ): AsyncIterableIterator<TurbopackResult<UpdateMessage>>
}

export type Route =
  | {
      type: 'conflict'
    }
  | {
      type: 'app-page'
      pages: {
        originalName: string
        htmlEndpoint: Endpoint
        rscEndpoint: Endpoint
      }[]
    }
  | {
      type: 'app-route'
      originalName: string
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

export interface Endpoint {
  /** Write files for the endpoint to disk. */
  writeToDisk(): Promise<TurbopackResult<WrittenEndpoint>>

  /**
   * Listen to client-side changes to the endpoint.
   * After clientChanged() has been awaited it will listen to changes.
   * The async iterator will yield for each change.
   */
  clientChanged(): Promise<AsyncIterableIterator<TurbopackResult>>

  /**
   * Listen to server-side changes to the endpoint.
   * After serverChanged() has been awaited it will listen to changes.
   * The async iterator will yield for each change.
   */
  serverChanged(
    includeIssues: boolean
  ): Promise<AsyncIterableIterator<TurbopackResult>>
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

export type ServerPath = {
  path: string
  contentHash: string
}

export type WrittenEndpoint =
  | {
      type: 'nodejs'
      /** The entry path for the endpoint. */
      entryPath: string
      /** All client paths that have been written for the endpoint. */
      clientPaths: string[]
      /** All server paths that have been written for the endpoint. */
      serverPaths: ServerPath[]
      config: EndpointConfig
    }
  | {
      type: 'edge'
      /** All client paths that have been written for the endpoint. */
      clientPaths: string[]
      /** All server paths that have been written for the endpoint. */
      serverPaths: ServerPath[]
      config: EndpointConfig
    }

function rustifyEnv(env: Record<string, string>): RustifiedEnv {
  return Object.entries(env)
    .filter(([_, value]) => value != null)
    .map(([name, value]) => ({
      name,
      value,
    }))
}

// TODO(sokra) Support wasm option.
function bindingToApi(binding: any, _wasm: boolean) {
  type NativeFunction<T> = (
    callback: (err: Error, value: T) => void
  ) => Promise<{ __napiType: 'RootTask' }>

  const cancel = new (class Cancel extends Error {})()

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
    let canceled = false

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

    const iterator = (async function* () {
      const task = await withErrorCause(() => nativeFunction(emitResult))
      try {
        while (!canceled) {
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
      } catch (e) {
        if (e === cancel) return
        throw e
      } finally {
        binding.rootTaskDispose(task)
      }
    })()
    iterator.return = async () => {
      canceled = true
      if (waiting) waiting.reject(cancel)
      return { value: undefined, done: true } as IteratorReturnResult<never>
    }
    return iterator
  }

  async function rustifyProjectOptions(
    options: Partial<ProjectOptions>
  ): Promise<any> {
    return {
      ...options,
      nextConfig:
        options.nextConfig &&
        (await serializeNextConfig(options.nextConfig, options.projectPath!)),
      jsConfig: options.jsConfig && JSON.stringify(options.jsConfig),
      env: options.env && rustifyEnv(options.env),
      defineEnv: options.defineEnv,
    }
  }

  class ProjectImpl implements Project {
    private _nativeProject: { __napiType: 'Project' }

    constructor(nativeProject: { __napiType: 'Project' }) {
      this._nativeProject = nativeProject
    }

    async update(options: Partial<ProjectOptions>) {
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
        instrumentation?: NapiInstrumentation
        pagesDocumentEndpoint: NapiEndpoint
        pagesAppEndpoint: NapiEndpoint
        pagesErrorEndpoint: NapiEndpoint
      }

      type NapiMiddleware = {
        endpoint: NapiEndpoint
        runtime: 'nodejs' | 'edge'
        matcher?: string[]
      }

      type NapiInstrumentation = {
        nodeJs: NapiEndpoint
        edge: NapiEndpoint
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
            type: 'app-page'
            pages: {
              originalName: string
              htmlEndpoint: NapiEndpoint
              rscEndpoint: NapiEndpoint
            }[]
          }
        | {
            type: 'app-route'
            originalName: string
            endpoint: NapiEndpoint
          }
        | {
            type: 'conflict'
          }
      )

      const subscription = subscribe<TurbopackResult<NapiEntrypoints>>(
        false,
        async (callback) =>
          binding.projectEntrypointsSubscribe(this._nativeProject, callback)
      )
      return (async function* () {
        for await (const entrypoints of subscription) {
          const routes = new Map()
          for (const { pathname, ...nativeRoute } of entrypoints.routes) {
            let route: Route
            const routeType = nativeRoute.type
            switch (routeType) {
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
              case 'app-page':
                route = {
                  type: 'app-page',
                  pages: nativeRoute.pages.map((page) => ({
                    originalName: page.originalName,
                    htmlEndpoint: new EndpointImpl(page.htmlEndpoint),
                    rscEndpoint: new EndpointImpl(page.rscEndpoint),
                  })),
                }
                break
              case 'app-route':
                route = {
                  type: 'app-route',
                  originalName: nativeRoute.originalName,
                  endpoint: new EndpointImpl(nativeRoute.endpoint),
                }
                break
              case 'conflict':
                route = {
                  type: 'conflict',
                }
                break
              default:
                const _exhaustiveCheck: never = routeType
                invariant(
                  nativeRoute,
                  () => `Unknown route type: ${_exhaustiveCheck}`
                )
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
          const napiInstrumentationToInstrumentation = (
            instrumentation: NapiInstrumentation
          ) => ({
            nodeJs: new EndpointImpl(instrumentation.nodeJs),
            edge: new EndpointImpl(instrumentation.edge),
          })
          const instrumentation = entrypoints.instrumentation
            ? napiInstrumentationToInstrumentation(entrypoints.instrumentation)
            : undefined
          yield {
            routes,
            middleware,
            instrumentation,
            pagesDocumentEndpoint: new EndpointImpl(
              entrypoints.pagesDocumentEndpoint
            ),
            pagesAppEndpoint: new EndpointImpl(entrypoints.pagesAppEndpoint),
            pagesErrorEndpoint: new EndpointImpl(
              entrypoints.pagesErrorEndpoint
            ),
            issues: entrypoints.issues,
            diagnostics: entrypoints.diagnostics,
          }
        }
      })()
    }

    hmrEvents(identifier: string) {
      return subscribe<TurbopackResult<Update>>(true, async (callback) =>
        binding.projectHmrEvents(this._nativeProject, identifier, callback)
      )
    }

    hmrIdentifiersSubscribe() {
      return subscribe<TurbopackResult<HmrIdentifiers>>(
        false,
        async (callback) =>
          binding.projectHmrIdentifiersSubscribe(this._nativeProject, callback)
      )
    }

    traceSource(
      stackFrame: TurbopackStackFrame
    ): Promise<TurbopackStackFrame | null> {
      return binding.projectTraceSource(this._nativeProject, stackFrame)
    }

    getSourceForAsset(filePath: string): Promise<string | null> {
      return binding.projectGetSourceForAsset(this._nativeProject, filePath)
    }

    updateInfoSubscribe(aggregationMs: number) {
      const subscription = subscribe<TurbopackResult<UpdateMessage>>(
        true,
        async (callback) =>
          binding.projectUpdateInfoSubscribe(
            this._nativeProject,
            aggregationMs,
            callback
          )
      )
      return subscription
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

    async clientChanged(): Promise<AsyncIterableIterator<TurbopackResult<{}>>> {
      const clientSubscription = subscribe<TurbopackResult>(
        false,
        async (callback) =>
          binding.endpointClientChangedSubscribe(
            await this._nativeEndpoint,
            callback
          )
      )
      await clientSubscription.next()
      return clientSubscription
    }

    async serverChanged(
      includeIssues: boolean
    ): Promise<AsyncIterableIterator<TurbopackResult<{}>>> {
      const serverSubscription = subscribe<TurbopackResult>(
        false,
        async (callback) =>
          binding.endpointServerChangedSubscribe(
            await this._nativeEndpoint,
            includeIssues,
            callback
          )
      )
      await serverSubscription.next()
      return serverSubscription
    }
  }

  async function serializeNextConfig(
    nextConfig: NextConfigComplete,
    projectPath: string
  ): Promise<string> {
    // Avoid mutating the existing `nextConfig` object.
    let nextConfigSerializable = { ...(nextConfig as any) }

    nextConfigSerializable.generateBuildId =
      await nextConfig.generateBuildId?.()

    // TODO: these functions takes arguments, have to be supported in a different way
    nextConfigSerializable.exportPathMap = {}
    nextConfigSerializable.webpack = nextConfig.webpack && {}

    if (nextConfig.experimental?.turbo?.rules) {
      ensureLoadersHaveSerializableOptions(nextConfig.experimental.turbo?.rules)
    }

    nextConfigSerializable.modularizeImports =
      nextConfigSerializable.modularizeImports
        ? Object.fromEntries(
            Object.entries<any>(nextConfigSerializable.modularizeImports).map(
              ([mod, config]) => [
                mod,
                {
                  ...config,
                  transform:
                    typeof config.transform === 'string'
                      ? config.transform
                      : Object.entries(config.transform).map(([key, value]) => [
                          key,
                          value,
                        ]),
                },
              ]
            )
          )
        : undefined

    // loaderFile is an absolute path, we need it to be relative for turbopack.
    if (nextConfigSerializable.images.loaderFile) {
      nextConfigSerializable.images = {
        ...nextConfig.images,
        loaderFile:
          './' + path.relative(projectPath, nextConfig.images.loaderFile),
      }
    }

    return JSON.stringify(nextConfigSerializable, null, 2)
  }

  function ensureLoadersHaveSerializableOptions(
    turbopackRules: Record<string, TurboRuleConfigItemOrShortcut>
  ) {
    for (const [glob, rule] of Object.entries(turbopackRules)) {
      if (Array.isArray(rule)) {
        checkLoaderItems(rule, glob)
      } else {
        checkConfigItem(rule, glob)
      }
    }

    function checkConfigItem(rule: TurboRuleConfigItem, glob: string) {
      if (!rule) return
      if ('loaders' in rule) {
        checkLoaderItems((rule as TurboRuleConfigItemOptions).loaders, glob)
      } else {
        for (const key in rule) {
          const inner = rule[key]
          if (typeof inner === 'object' && inner) {
            checkConfigItem(inner, glob)
          }
        }
      }
    }

    function checkLoaderItems(loaderItems: TurboLoaderItem[], glob: string) {
      for (const loaderItem of loaderItems) {
        if (
          typeof loaderItem !== 'string' &&
          !isDeepStrictEqual(loaderItem, JSON.parse(JSON.stringify(loaderItem)))
        ) {
          throw new Error(
            `loader ${loaderItem.loader} for match "${glob}" does not have serializable options. Ensure that options passed are plain JavaScript objects and values.`
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

async function loadWasm(importPath = '') {
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
      let bindings = await import(pathToFileURL(pkgPath).toString())
      if (pkg === '@next/swc-wasm-web') {
        bindings = await bindings.default()
      }
      infoLog('next-swc build: wasm build @next/swc-wasm-web')

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
          return bindings.parseSync(src.toString(), options)
        },
        getTargetTriple() {
          return undefined
        },
        turbo: {
          startTrace: () => {
            Log.error('Wasm binding does not support trace yet')
          },
          entrypoints: {
            stream: (
              turboTasks: any,
              rootDir: string,
              applicationDir: string,
              pageExtensions: PageExtensions,
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
              pageExtensions: PageExtensions
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
            bindings.mdxCompile(src, getMdxOptions(options)),
          compileSync: (src: string, options: any) =>
            bindings.mdxCompileSync(src, getMdxOptions(options)),
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

function loadNative(importPath?: string) {
  if (nativeBindings) {
    return nativeBindings
  }

  const customBindings = !!__INTERNAL_CUSTOM_TURBOPACK_BINDINGS
    ? require(__INTERNAL_CUSTOM_TURBOPACK_BINDINGS)
    : null
  let bindings: any
  let attempts: any[] = []

  const NEXT_TEST_NATIVE_DIR = process.env.NEXT_TEST_NATIVE_DIR
  for (const triple of triples) {
    if (NEXT_TEST_NATIVE_DIR) {
      try {
        // Use the binary directly to skip `pnpm pack` for testing as it's slow because of the large native binary.
        bindings = require(`${NEXT_TEST_NATIVE_DIR}/next-swc.${triple.platformArchABI}.node`)
        console.log(
          'next-swc build: local built @next/swc from NEXT_TEST_NATIVE_DIR'
        )
        break
      } catch (e) {}
    } else {
      try {
        bindings = require(`@next/swc/native/next-swc.${triple.platformArchABI}.node`)
        console.log('next-swc build: local built @next/swc')
        break
      } catch (e) {}
    }
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
    nativeBindings = {
      isWasm: false,
      transform(src: string, options: any) {
        const isModule =
          typeof src !== 'undefined' &&
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
        if (typeof src === 'undefined') {
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
      turbo: {
        startTrace: (options = {}, turboTasks: unknown) => {
          initHeapProfiler()
          return (customBindings ?? bindings).runTurboTracing(
            toBuffer({ exact: true, ...options }),
            turboTasks
          )
        },
        createTurboTasks: (memoryLimit?: number): unknown =>
          bindings.createTurboTasks(memoryLimit),
        entrypoints: {
          stream: (
            turboTasks: any,
            rootDir: string,
            applicationDir: string,
            pageExtensions: PageExtensions,
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
            pageExtensions: PageExtensions
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
          bindings.mdxCompile(src, toBuffer(getMdxOptions(options))),
        compileSync: (src: string, options: any) =>
          bindings.mdxCompileSync(src, toBuffer(getMdxOptions(options))),
      },
      css: {
        lightning: {
          transform: (transformOptions: any) =>
            bindings.lightningCssTransform(transformOptions),
          transformStyleAttr: (transformAttrOptions: any) =>
            bindings.lightningCssTransformStyleAttribute(transformAttrOptions),
        },
      },
    }
    return nativeBindings
  }

  throw attempts
}

/// Build a mdx options object contains default values that
/// can be parsed with serde_wasm_bindgen.
function getMdxOptions(options: any = {}) {
  return {
    ...options,
    development: options.development ?? false,
    jsx: options.jsx ?? false,
    parse: options.parse ?? {
      gfmStrikethroughSingleTilde: true,
      mathTextSingleDollar: true,
    },
  }
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
