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
  NextConfigComplete,
  TurbopackLoaderBuiltinCondition,
  TurbopackLoaderItem,
  TurbopackRuleCondition,
  TurbopackRuleConfigCollection,
  TurbopackRuleConfigItem,
} from '../../server/config-shared'
import { isDeepStrictEqual } from 'util'
import { type DefineEnvOptions, getDefineEnv } from '../define-env'
import type {
  NapiPartialProjectOptions,
  NapiProjectOptions,
  NapiSourceDiagnostic,
} from './generated-native'
import type {
  Binding,
  CompilationEvent,
  DefineEnv,
  Endpoint,
  HmrIdentifiers,
  Lockfile,
  Project,
  ProjectOptions,
  RawEntrypoints,
  Route,
  TurboEngineOptions,
  TurbopackResult,
  TurbopackStackFrame,
  Update,
  UpdateMessage,
  WrittenEndpoint,
} from './types'
import { throwTurbopackInternalError } from '../../shared/lib/turbopack/internal-error'

type RawBindings = typeof import('./generated-native')
type RawWasmBindings = typeof import('./generated-wasm') & {
  default?(): Promise<typeof import('./generated-wasm')>
}

const nextVersion = process.env.__NEXT_VERSION as string

const ArchName = arch()
const PlatformName = platform()

function infoLog(...args: any[]) {
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
export function getSupportedArchTriples(): Record<string, any> {
  const { darwin, win32, linux, freebsd, android } = platformArchTriples

  return {
    darwin,
    win32: {
      arm64: win32.arm64,
      ia32: win32.ia32.filter((triple) => triple.abi === 'msvc'),
      x64: win32.x64.filter((triple) => triple.abi === 'msvc'),
    },
    linux: {
      // linux[x64] includes `gnux32` abi, with x64 arch.
      x64: linux.x64.filter((triple) => triple.abi !== 'gnux32'),
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
// If one of env variables is set, `loadNative` will try to use specified
// binary instead. This is thin, naive interface
// - `loadBindings` will not validate neither path nor the binary.
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
// Used to cache calls to `loadBindings`
let pendingBindings: Promise<Binding>
// some things call `loadNative` directly instead of `loadBindings`... Cache calls to that
// separately.
let nativeBindings: Binding
// can allow hacky sync access to bindings for loadBindingsSync
let wasmBindings: Binding
let downloadWasmPromise: any
let swcTraceFlushGuard: any
let downloadNativeBindingsPromise: Promise<void> | undefined = undefined

export const lockfilePatchPromise: { cur?: Promise<void> } = {}

/**
 * Attempts to load a native or wasm binding.
 *
 * By default, this first tries to use a native binding, falling back to a wasm binding if that
 * fails.
 *
 * This function is `async` as wasm requires an asynchronous import in browsers.
 */
export async function loadBindings(
  useWasmBinary: boolean = false
): Promise<Binding> {
  if (pendingBindings) {
    return pendingBindings
  }

  // Increase Rust stack size as some npm packages being compiled need more than the default.
  if (!process.env.RUST_MIN_STACK) {
    process.env.RUST_MIN_STACK = '8388608'
  }

  if (process.env.NEXT_TEST_WASM) {
    useWasmBinary = true
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
    // Normal execution relies on the param `useWasmBinary` flag to load, but
    // in certain cases where there isn't a native binary we always load wasm fallback first.
    const shouldLoadWasmFallbackFirst =
      (!disableWasmFallback && useWasmBinary) ||
      unsupportedPlatform ||
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

    // For these platforms we already tried to load wasm and failed, skip reattempt
    if (!shouldLoadWasmFallbackFirst && !disableWasmFallback) {
      const fallbackBindings = await tryLoadWasmWithFallback(attempts)
      if (fallbackBindings) {
        return resolve(fallbackBindings)
      }
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
    return loadNative(nativeBindingsDirectory)
  } catch (a: any) {
    attempts.push(...[].concat(a))
  }

  return undefined
}

// helper for loadBindings
async function tryLoadWasmWithFallback(
  attempts: any[]
): Promise<Binding | undefined> {
  try {
    let bindings = await loadWasm('')
    // @ts-expect-error TODO: this event has a wrong type.
    eventSwcLoadFailure({
      wasm: 'enabled',
      nativeBindingsErrorCode: lastNativeBindingsLoadErrorCode,
    })
    return bindings
  } catch (a: any) {
    attempts.push(...[].concat(a))
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
  } catch (a: any) {
    attempts.push(...[].concat(a))
  }
}

function loadBindingsSync() {
  let attempts: any[] = []
  try {
    return loadNative()
  } catch (a) {
    attempts = attempts.concat(a)
  }

  // HACK: we can leverage the wasm bindings if they are already loaded
  // this may introduce race conditions
  if (wasmBindings) {
    return wasmBindings
  }

  logLoadFailure(attempts)
  throw new Error('Failed to load bindings', { cause: attempts })
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

type RustifiedEnv = { name: string; value: string }[]
type RustifiedOptionEnv = { name: string; value: string | undefined }[]

export function createDefineEnv({
  isTurbopack,
  clientRouterFilters,
  config,
  dev,
  distDir,
  projectPath,
  fetchCacheKeyPrefix,
  hasRewrites,
  middlewareMatchers,
  rewrites,
}: Omit<
  DefineEnvOptions,
  'isClient' | 'isNodeOrEdgeCompilation' | 'isEdgeServer' | 'isNodeServer'
>): DefineEnv {
  let defineEnv: DefineEnv = {
    client: [],
    edge: [],
    nodejs: [],
  }

  for (const variant of Object.keys(defineEnv) as (keyof typeof defineEnv)[]) {
    defineEnv[variant] = rustifyOptionEnv(
      getDefineEnv({
        isTurbopack,
        clientRouterFilters,
        config,
        dev,
        distDir,
        projectPath,
        fetchCacheKeyPrefix,
        hasRewrites,
        isClient: variant === 'client',
        isEdgeServer: variant === 'edge',
        isNodeServer: variant === 'nodejs',
        middlewareMatchers,
        rewrites,
      })
    )
  }

  return defineEnv
}

function rustifyEnv(env: Record<string, string>): RustifiedEnv {
  return Object.entries(env)
    .filter(([_, value]) => value != null)
    .map(([name, value]) => ({
      name,
      value,
    }))
}

function rustifyOptionEnv(
  env: Record<string, string | undefined>
): RustifiedOptionEnv {
  return Object.entries(env).map(([name, value]) => ({
    name,
    value,
  }))
}

// TODO(sokra) Support wasm option.
function bindingToApi(
  binding: RawBindings,
  _wasm: boolean
): Binding['turbo']['createProject'] {
  type NativeFunction<T> = (
    callback: (err: Error, value: T) => void
  ) => Promise<{ __napiType: 'RootTask' }>

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
    isProxy: boolean
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

  /**
   * Calls a native function and streams the result.
   * If useBuffer is true, all values will be preserved, potentially buffered
   * if consumed slower than produced. Else, only the latest value will be
   * preserved.
   */
  function subscribe<T>(
    useBuffer: boolean,
    nativeFunction:
      | NativeFunction<T>
      | ((callback: (err: Error, value: T) => void) => Promise<void>)
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
    function emitResult(err: Error | undefined, value: T | undefined) {
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

    async function* createIterator() {
      const task = await nativeFunction(emitResult)
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
        if (task) {
          binding.rootTaskDispose(task)
        }
      }
    }

    const iterator = createIterator()
    iterator.return = async () => {
      canceled = true
      if (waiting) waiting.reject(cancel)
      return { value: undefined, done: true } as IteratorReturnResult<never>
    }
    return iterator
  }

  async function rustifyProjectOptions(
    options: ProjectOptions
  ): Promise<NapiProjectOptions> {
    return {
      ...options,
      nextConfig: await serializeNextConfig(
        options.nextConfig,
        path.join(options.rootPath, options.projectPath)
      ),
      env: rustifyEnv(options.env),
    }
  }

  async function rustifyPartialProjectOptions(
    options: Partial<ProjectOptions>
  ): Promise<NapiPartialProjectOptions> {
    return {
      ...options,
      nextConfig:
        options.nextConfig &&
        (await serializeNextConfig(
          options.nextConfig,
          path.join(options.rootPath!, options.projectPath!)
        )),
      env: options.env && rustifyEnv(options.env),
    }
  }

  class ProjectImpl implements Project {
    private readonly _nativeProject: { __napiType: 'Project' }

    constructor(nativeProject: { __napiType: 'Project' }) {
      this._nativeProject = nativeProject
    }

    async update(options: Partial<ProjectOptions>) {
      await binding.projectUpdate(
        this._nativeProject,
        await rustifyPartialProjectOptions(options)
      )
    }

    async writeAllEntrypointsToDisk(
      appDirOnly: boolean
    ): Promise<TurbopackResult<Partial<RawEntrypoints>>> {
      const napiEndpoints = (await binding.projectWriteAllEntrypointsToDisk(
        this._nativeProject,
        appDirOnly
      )) as TurbopackResult<Partial<NapiEntrypoints>>

      if ('routes' in napiEndpoints) {
        return napiEntrypointsToRawEntrypoints(
          napiEndpoints as TurbopackResult<NapiEntrypoints>
        )
      } else {
        return {
          issues: napiEndpoints.issues,
          diagnostics: napiEndpoints.diagnostics,
        }
      }
    }

    entrypointsSubscribe() {
      const subscription = subscribe<TurbopackResult<NapiEntrypoints | {}>>(
        false,
        async (callback) =>
          binding.projectEntrypointsSubscribe(this._nativeProject, callback)
      )
      return (async function* () {
        for await (const entrypoints of subscription) {
          if ('routes' in (entrypoints as TurbopackResult<NapiEntrypoints>)) {
            yield napiEntrypointsToRawEntrypoints(
              entrypoints as TurbopackResult<NapiEntrypoints>
            )
          } else {
            yield {
              issues: entrypoints.issues,
              diagnostics: entrypoints.diagnostics,
            } as TurbopackResult<{}>
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
      stackFrame: TurbopackStackFrame,
      currentDirectoryFileUrl: string
    ): Promise<TurbopackStackFrame | null> {
      return binding.projectTraceSource(
        this._nativeProject,
        stackFrame,
        currentDirectoryFileUrl
      )
    }

    getSourceForAsset(filePath: string): Promise<string | null> {
      return binding.projectGetSourceForAsset(this._nativeProject, filePath)
    }

    getSourceMap(filePath: string): Promise<string | null> {
      return binding.projectGetSourceMap(this._nativeProject, filePath)
    }

    getSourceMapSync(filePath: string): string | null {
      return binding.projectGetSourceMapSync(this._nativeProject, filePath)
    }

    updateInfoSubscribe(aggregationMs: number) {
      return subscribe<TurbopackResult<UpdateMessage>>(true, async (callback) =>
        binding.projectUpdateInfoSubscribe(
          this._nativeProject,
          aggregationMs,
          callback
        )
      )
    }

    compilationEventsSubscribe(eventTypes?: string[]) {
      return subscribe<TurbopackResult<CompilationEvent>>(
        true,
        async (callback) => {
          binding.projectCompilationEventsSubscribe(
            this._nativeProject,
            callback,
            eventTypes
          )
        }
      )
    }

    invalidateFileSystemCache(): Promise<void> {
      return binding.projectInvalidateFileSystemCache(this._nativeProject)
    }

    shutdown(): Promise<void> {
      return binding.projectShutdown(this._nativeProject)
    }

    onExit(): Promise<void> {
      return binding.projectOnExit(this._nativeProject)
    }
  }

  class EndpointImpl implements Endpoint {
    private readonly _nativeEndpoint: { __napiType: 'Endpoint' }

    constructor(nativeEndpoint: { __napiType: 'Endpoint' }) {
      this._nativeEndpoint = nativeEndpoint
    }

    async writeToDisk(): Promise<TurbopackResult<WrittenEndpoint>> {
      return (await binding.endpointWriteToDisk(
        this._nativeEndpoint
      )) as TurbopackResult<WrittenEndpoint>
    }

    async clientChanged(): Promise<AsyncIterableIterator<TurbopackResult>> {
      const clientSubscription = subscribe<TurbopackResult>(
        false,
        async (callback) =>
          binding.endpointClientChangedSubscribe(this._nativeEndpoint, callback)
      )
      await clientSubscription.next()
      return clientSubscription
    }

    async serverChanged(
      includeIssues: boolean
    ): Promise<AsyncIterableIterator<TurbopackResult>> {
      const serverSubscription = subscribe<TurbopackResult>(
        false,
        async (callback) =>
          binding.endpointServerChangedSubscribe(
            this._nativeEndpoint,
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
    // Avoid mutating the existing `nextConfig` object. NOTE: This is only a shallow clone.
    let nextConfigSerializable: Record<string, any> = { ...nextConfig }

    nextConfigSerializable.generateBuildId =
      await nextConfigSerializable.generateBuildId?.()

    // TODO: these functions takes arguments, have to be supported in a different way
    nextConfigSerializable.exportPathMap = {}
    nextConfigSerializable.webpack = nextConfigSerializable.webpack && {}

    if (nextConfigSerializable.modularizeImports) {
      nextConfigSerializable.modularizeImports = Object.fromEntries(
        Object.entries<any>(nextConfigSerializable.modularizeImports).map(
          ([mod, config]) => [
            mod,
            {
              ...config,
              transform:
                typeof config.transform === 'string'
                  ? config.transform
                  : Object.entries(config.transform),
            },
          ]
        )
      )
    }

    // loaderFile is an absolute path, we need it to be relative for turbopack.
    if (nextConfigSerializable.images.loaderFile) {
      nextConfigSerializable.images = {
        ...nextConfigSerializable.images,
        loaderFile:
          './' +
          path.relative(projectPath, nextConfigSerializable.images.loaderFile),
      }
    }

    // cacheHandler can be an absolute path, we need it to be relative for turbopack.
    if (nextConfigSerializable.cacheHandler) {
      nextConfigSerializable.cacheHandler =
        './' +
        (path.isAbsolute(nextConfigSerializable.cacheHandler)
          ? path.relative(projectPath, nextConfigSerializable.cacheHandler)
          : nextConfigSerializable.cacheHandler)
    }
    if (nextConfigSerializable.experimental?.cacheHandlers) {
      nextConfigSerializable.experimental = {
        ...nextConfigSerializable.experimental,
        cacheHandlers: Object.fromEntries(
          Object.entries(
            nextConfigSerializable.experimental.cacheHandlers as Record<
              string,
              string
            >
          )
            .filter(([_, value]) => value != null)
            .map(([key, value]) => [
              key,
              './' +
                (path.isAbsolute(value)
                  ? path.relative(projectPath, value)
                  : value),
            ])
        ),
      }
    }

    if (nextConfigSerializable.turbopack != null) {
      // clone to allow in-place mutations
      const turbopack = { ...nextConfigSerializable.turbopack }

      if (turbopack.rules) {
        turbopack.rules = serializeTurbopackRules(turbopack.rules)
      }

      nextConfigSerializable.turbopack = turbopack
    }

    return JSON.stringify(nextConfigSerializable, null, 2)
  }

  type SerializedRuleCondition =
    | { all: SerializedRuleCondition[] }
    | { any: SerializedRuleCondition[] }
    | { not: SerializedRuleCondition }
    | TurbopackLoaderBuiltinCondition
    | {
        path?:
          | { type: 'regex'; value: { source: string; flags: string } }
          | { type: 'glob'; value: string }
        content?: { source: string; flags: string }
      }

  // converts regexes to a `RegexComponents` object so that it can be JSON-serialized when passed to
  // Turbopack
  function serializeRuleCondition(
    cond: TurbopackRuleCondition
  ): SerializedRuleCondition {
    function regexComponents(regex: RegExp) {
      return {
        source: regex.source,
        flags: regex.flags,
      }
    }

    if (typeof cond === 'string') {
      return cond
    } else if ('all' in cond) {
      return { ...cond, all: cond.all.map(serializeRuleCondition) }
    } else if ('any' in cond) {
      return { ...cond, any: cond.any.map(serializeRuleCondition) }
    } else if ('not' in cond) {
      return { ...cond, not: serializeRuleCondition(cond.not) }
    } else {
      return {
        ...cond,
        path:
          cond.path == null
            ? undefined
            : cond.path instanceof RegExp
              ? {
                  type: 'regex',
                  value: regexComponents(cond.path),
                }
              : { type: 'glob', value: cond.path },
        content: cond.content && regexComponents(cond.content),
      }
    }
  }

  // Note: Returns an updated `turbopackRules` with serialized conditions. Does not mutate in-place.
  function serializeTurbopackRules(
    turbopackRules: Record<string, TurbopackRuleConfigCollection>
  ): Record<string, any> {
    const serializedRules: Record<string, any> = {}
    for (const [glob, rule] of Object.entries(turbopackRules)) {
      if (Array.isArray(rule)) {
        serializedRules[glob] = rule.map((item) => {
          if (typeof item !== 'string' && 'loaders' in item) {
            return serializeConfigItem(item, glob)
          } else {
            checkLoaderItem(item, glob)
            return item
          }
        })
      } else {
        serializedRules[glob] = serializeConfigItem(rule, glob)
      }
    }

    return serializedRules

    function serializeConfigItem(
      rule: TurbopackRuleConfigItem,
      glob: string
    ): any {
      if (!rule) return rule
      for (const item of rule.loaders) {
        checkLoaderItem(item, glob)
      }
      let serializedRule: any = rule
      if (rule.condition != null) {
        serializedRule = {
          ...rule,
          condition: serializeRuleCondition(rule.condition),
        }
      }
      return serializedRule
    }

    function checkLoaderItem(loaderItem: TurbopackLoaderItem, glob: string) {
      if (
        typeof loaderItem !== 'string' &&
        !isDeepStrictEqual(loaderItem, JSON.parse(JSON.stringify(loaderItem)))
      ) {
        throw new Error(
          `loader ${loaderItem.loader} for match "${glob}" does not have serializable options. ` +
            'Ensure that options passed are plain JavaScript objects and values.'
        )
      }
    }
  }

  function napiEntrypointsToRawEntrypoints(
    entrypoints: TurbopackResult<NapiEntrypoints>
  ): TurbopackResult<RawEntrypoints> {
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
        default: {
          const _exhaustiveCheck: never = routeType
          invariant(
            nativeRoute,
            () => `Unknown route type: ${_exhaustiveCheck}`
          )
        }
      }
      routes.set(pathname, route)
    }
    const napiMiddlewareToMiddleware = (middleware: NapiMiddleware) => ({
      endpoint: new EndpointImpl(middleware.endpoint),
      isProxy: middleware.isProxy,
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

    return {
      routes,
      middleware,
      instrumentation,
      pagesDocumentEndpoint: new EndpointImpl(
        entrypoints.pagesDocumentEndpoint
      ),
      pagesAppEndpoint: new EndpointImpl(entrypoints.pagesAppEndpoint),
      pagesErrorEndpoint: new EndpointImpl(entrypoints.pagesErrorEndpoint),
      issues: entrypoints.issues,
      diagnostics: entrypoints.diagnostics,
    }
  }

  return async function createProject(
    options: ProjectOptions,
    turboEngineOptions
  ) {
    return new ProjectImpl(
      await binding.projectNew(
        await rustifyProjectOptions(options),
        turboEngineOptions || {},
        {
          throwTurbopackInternalError,
        }
      )
    )
  }
}

// helper for loadWasm
async function loadWasmRawBindings(importPath = ''): Promise<RawWasmBindings> {
  let attempts = []

  // Used by `run-tests` to force use of a locally-built wasm binary. This environment variable is
  // unstable and subject to change.
  const testWasmDir = process.env.NEXT_TEST_WASM_DIR

  if (testWasmDir) {
    // assume these are node.js bindings and don't need a call to `.default()`
    const rawBindings = await import(
      pathToFileURL(path.join(testWasmDir, 'wasm.js')).toString()
    )
    infoLog(`next-swc build: wasm build ${testWasmDir}`)
    return rawBindings
  } else {
    for (let pkg of ['@next/swc-wasm-nodejs', '@next/swc-wasm-web']) {
      try {
        let pkgPath = pkg

        if (importPath) {
          // the import path must be exact when not in node_modules
          pkgPath = path.join(importPath, pkg, 'wasm.js')
        }
        const importedRawBindings = await import(
          pathToFileURL(pkgPath).toString()
        )
        let rawBindings
        if (pkg === '@next/swc-wasm-web') {
          // https://rustwasm.github.io/docs/wasm-bindgen/examples/without-a-bundler.html
          // `default` must be called to initialize the module
          rawBindings = await importedRawBindings.default!()
        } else {
          rawBindings = importedRawBindings
        }
        infoLog(`next-swc build: wasm build ${pkg}`)
        return rawBindings
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
  }

  throw attempts
}

// helper for tryLoadWasmWithFallback / loadBindings.
async function loadWasm(importPath = '') {
  const rawBindings = await loadWasmRawBindings(importPath)

  function removeUndefined(obj: any): any {
    // serde-wasm-bindgen expect that `undefined` values map to `()` in rust, but we want to treat
    // those fields as non-existent, so remove them before passing them to rust.
    //
    // The native (non-wasm) bindings use `JSON.stringify`, which strips undefined values.
    if (typeof obj !== 'object' || obj === null) {
      return obj
    }
    if (Array.isArray(obj)) {
      return obj.map(removeUndefined)
    }
    const newObj: { [key: string]: any } = {}
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== 'undefined') {
        newObj[k] = removeUndefined(v)
      }
    }
    return newObj
  }

  // Note wasm binary does not support async intefaces yet, all async
  // interface coereces to sync interfaces.
  wasmBindings = {
    css: {
      lightning: {
        transform: function (_options: any) {
          throw new Error(
            '`css.lightning.transform` is not supported by the wasm bindings.'
          )
        },
        transformStyleAttr: function (_options: any) {
          throw new Error(
            '`css.lightning.transformStyleAttr` is not supported by the wasm bindings.'
          )
        },
      },
    },
    isWasm: true,
    transform(src: string, options: any): Promise<any> {
      return rawBindings.transform(src.toString(), removeUndefined(options))
    },
    transformSync(src: string, options: any) {
      return rawBindings.transformSync(src.toString(), removeUndefined(options))
    },
    minify(src: string, options: any): Promise<any> {
      return rawBindings.minify(src.toString(), removeUndefined(options))
    },
    minifySync(src: string, options: any) {
      return rawBindings.minifySync(src.toString(), removeUndefined(options))
    },
    parse(src: string, options: any): Promise<any> {
      return rawBindings.parse(src.toString(), removeUndefined(options))
    },
    getTargetTriple() {
      return undefined
    },
    turbo: {
      createProject(
        _options: ProjectOptions,
        _turboEngineOptions?: TurboEngineOptions | undefined
      ): Promise<Project> {
        throw new Error(
          '`turbo.createProject` is not supported by the wasm bindings.'
        )
      },
      startTurbopackTraceServer(
        _traceFilePath: string,
        _port: number | undefined
      ): void {
        throw new Error(
          '`turbo.startTurbopackTraceServer` is not supported by the wasm bindings.'
        )
      },
    },
    mdx: {
      compile(src: string, options: any) {
        return rawBindings.mdxCompile(
          src,
          removeUndefined(getMdxOptions(options))
        )
      },
      compileSync(src: string, options: any) {
        return rawBindings.mdxCompileSync(
          src,
          removeUndefined(getMdxOptions(options))
        )
      },
    },
    reactCompiler: {
      isReactCompilerRequired(_filename: string) {
        return Promise.resolve(true)
      },
    },
    rspack: {
      getModuleNamedExports(_resourcePath: string): Promise<string[]> {
        throw new Error(
          '`rspack.getModuleNamedExports` is not supported by the wasm bindings.'
        )
      },
      warnForEdgeRuntime(
        _source: string,
        _isProduction: boolean
      ): Promise<NapiSourceDiagnostic[]> {
        throw new Error(
          '`rspack.warnForEdgeRuntime` is not supported by the wasm bindings.'
        )
      },
    },
    expandNextJsTemplate(
      content: Buffer,
      templatePath: string,
      nextPackageDirPath: string,
      replacements: Record<`VAR_${string}`, string>,
      injections: Record<string, string>,
      imports: Record<string, string | null>
    ): string {
      return rawBindings.expandNextJsTemplate(
        content,
        templatePath,
        nextPackageDirPath,
        replacements,
        injections,
        imports
      )
    },
    lockfileTryAcquire(_filePath: string) {
      throw new Error(
        '`lockfileTryAcquire` is not supported by the wasm bindings.'
      )
    },
    lockfileTryAcquireSync(_filePath: string) {
      throw new Error(
        '`lockfileTryAcquireSync` is not supported by the wasm bindings.'
      )
    },
    lockfileUnlock(_lockfile: Lockfile) {
      throw new Error('`lockfileUnlock` is not supported by the wasm bindings.')
    },
    lockfileUnlockSync(_lockfile: Lockfile) {
      throw new Error(
        '`lockfileUnlockSync` is not supported by the wasm bindings.'
      )
    },
  }
  return wasmBindings
}

/**
 * Loads the native (non-wasm) bindings. Prefer `loadBindings` over this API, as that includes a
 * wasm fallback.
 */
function loadNative(importPath?: string) {
  if (nativeBindings) {
    return nativeBindings
  }

  if (process.env.NEXT_TEST_WASM) {
    throw new Error('cannot run loadNative when `NEXT_TEST_WASM` is set')
  }

  const customBindings: RawBindings = !!__INTERNAL_CUSTOM_TURBOPACK_BINDINGS
    ? require(__INTERNAL_CUSTOM_TURBOPACK_BINDINGS)
    : null
  let bindings: RawBindings = customBindings
  let attempts: any[] = []

  const NEXT_TEST_NATIVE_DIR = process.env.NEXT_TEST_NATIVE_DIR
  for (const triple of triples) {
    if (NEXT_TEST_NATIVE_DIR) {
      try {
        // Use the binary directly to skip `pnpm pack` for testing as it's slow because of the large native binary.
        bindings = require(
          `${NEXT_TEST_NATIVE_DIR}/next-swc.${triple.platformArchABI}.node`
        )
        infoLog(
          'next-swc build: local built @next/swc from NEXT_TEST_NATIVE_DIR'
        )
        break
      } catch (e) {}
    } else {
      try {
        bindings = require(
          `@next/swc/native/next-swc.${triple.platformArchABI}.node`
        )
        infoLog('next-swc build: local built @next/swc')
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
        return bindings.minify(Buffer.from(src), toBuffer(options ?? {}))
      },

      minifySync(src: string, options: any) {
        return bindings.minifySync(Buffer.from(src), toBuffer(options ?? {}))
      },

      parse(src: string, options: any) {
        return bindings.parse(src, toBuffer(options ?? {}))
      },

      getTargetTriple: bindings.getTargetTriple,
      initCustomTraceSubscriber: bindings.initCustomTraceSubscriber,
      teardownTraceSubscriber: bindings.teardownTraceSubscriber,
      turbo: {
        createProject: bindingToApi(customBindings ?? bindings, false),
        startTurbopackTraceServer(traceFilePath, port) {
          Log.warn(
            `Turbopack trace server started. View trace at https://trace.nextjs.org${port != null ? `?port=${port}` : ''}`
          )
          ;(customBindings ?? bindings).startTurbopackTraceServer(
            traceFilePath,
            port
          )
        },
      },
      mdx: {
        compile(src: string, options: any) {
          return bindings.mdxCompile(src, toBuffer(getMdxOptions(options)))
        },
        compileSync(src: string, options: any) {
          bindings.mdxCompileSync(src, toBuffer(getMdxOptions(options)))
        },
      },
      css: {
        lightning: {
          transform(transformOptions: any) {
            return bindings.lightningCssTransform(transformOptions)
          },
          transformStyleAttr(transformAttrOptions: any) {
            return bindings.lightningCssTransformStyleAttribute(
              transformAttrOptions
            )
          },
        },
      },
      reactCompiler: {
        isReactCompilerRequired: (filename: string) => {
          return bindings.isReactCompilerRequired(filename)
        },
      },
      rspack: {
        getModuleNamedExports: function (
          resourcePath: string
        ): Promise<string[]> {
          return bindings.getModuleNamedExports(resourcePath)
        },
        warnForEdgeRuntime: function (
          source: string,
          isProduction: boolean
        ): Promise<NapiSourceDiagnostic[]> {
          return bindings.warnForEdgeRuntime(source, isProduction)
        },
      },
      expandNextJsTemplate(
        content: Buffer,
        templatePath: string,
        nextPackageDirPath: string,
        replacements: Record<`VAR_${string}`, string>,
        injections: Record<string, string>,
        imports: Record<string, string | null>
      ): string {
        return bindings.expandNextJsTemplate(
          content,
          templatePath,
          nextPackageDirPath,
          replacements,
          injections,
          imports
        )
      },
      lockfileTryAcquire(filePath: string) {
        return bindings.lockfileTryAcquire(filePath)
      },
      lockfileTryAcquireSync(filePath: string) {
        return bindings.lockfileTryAcquireSync(filePath)
      },
      lockfileUnlock(lockfile: Lockfile) {
        return bindings.lockfileUnlock(lockfile)
      },
      lockfileUnlockSync(lockfile: Lockfile) {
        return bindings.lockfileUnlockSync(lockfile)
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
    mdxType: options.mdxType ?? 'commonMark',
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

export async function minify(
  src: string,
  options: any
): Promise<{ code: string; map: any }> {
  let bindings = await loadBindings()
  return bindings.minify(src, options)
}

export async function isReactCompilerRequired(
  filename: string
): Promise<boolean> {
  let bindings = await loadBindings()
  return bindings.reactCompiler.isReactCompilerRequired(filename)
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
export function initCustomTraceSubscriber(traceFileName?: string) {
  if (!swcTraceFlushGuard) {
    // Wasm binary doesn't support trace emission
    let bindings = loadNative()
    swcTraceFlushGuard = bindings.initCustomTraceSubscriber?.(traceFileName)
  }
}

function once(fn: () => void): () => void {
  let executed = false

  return function (): void {
    if (!executed) {
      executed = true

      fn()
    }
  }
}

/**
 * Teardown swc's trace subscriber if there's an initialized flush guard exists.
 *
 * This is workaround to amend behavior with process.exit
 * (https://github.com/vercel/next.js/blob/4db8c49cc31e4fc182391fae6903fb5ef4e8c66e/packages/next/bin/next.ts#L134=)
 * seems preventing napi's cleanup hook execution (https://github.com/swc-project/swc/blob/main/crates/node/src/util.rs#L48-L51=),
 *
 * instead parent process manually drops guard when process gets signal to exit.
 */
export const teardownTraceSubscriber = once(() => {
  try {
    let bindings = loadNative()
    if (swcTraceFlushGuard) {
      bindings.teardownTraceSubscriber?.(swcTraceFlushGuard)
    }
  } catch (e) {
    // Suppress exceptions, this fn allows to fail to load native bindings
  }
})

export async function getModuleNamedExports(
  resourcePath: string
): Promise<string[]> {
  const bindings = await loadBindings()
  return bindings.rspack.getModuleNamedExports(resourcePath)
}

export async function warnForEdgeRuntime(
  source: string,
  isProduction: boolean
): Promise<NapiSourceDiagnostic[]> {
  const bindings = await loadBindings()
  return bindings.rspack.warnForEdgeRuntime(source, isProduction)
}
