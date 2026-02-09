/**
 * This file contains runtime types and functions that are shared between all
 * Turbopack *browser* ECMAScript runtimes.
 *
 * It will be appended to the runtime code of each runtime right after the
 * shared runtime utils.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../base/globals.d.ts" />
/// <reference path="../../../shared/runtime-utils.ts" />

// Used in WebWorkers to tell the runtime about the chunk suffix
declare var TURBOPACK_ASSET_SUFFIX: string
// Used in WebWorkers to tell the runtime about the current chunk url since it
// can't be detected via `document.currentScript`. Note it's stored in reversed
// order to use `push` and `pop`
declare var TURBOPACK_NEXT_CHUNK_URLS: ChunkUrl[] | undefined

// Injected by rust code
declare var CHUNK_BASE_PATH: string
declare var ASSET_SUFFIX: string
declare var WORKER_FORWARDED_GLOBALS: string[]

interface TurbopackBrowserBaseContext<M> extends TurbopackBaseContext<M> {
  R: ResolvePathFromModule
}

const browserContextPrototype =
  Context.prototype as TurbopackBrowserBaseContext<unknown>

// Provided by build or dev base
declare function instantiateModule(
  id: ModuleId,
  sourceType: SourceType,
  sourceData: SourceData
): Module

type RuntimeParams = {
  otherChunks: ChunkData[]
  runtimeModuleIds: ModuleId[]
}

type ChunkRegistrationChunk =
  | ChunkPath
  | { getAttribute: (name: string) => string | null }
  | undefined

type ChunkRegistration = [
  chunkPath: ChunkRegistrationChunk,
  ...([RuntimeParams] | CompressedModuleFactories),
]

type ChunkList = {
  script: ChunkRegistrationChunk
  chunks: ChunkData[]
  source: 'entry' | 'dynamic'
}

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
interface RuntimeBackend {
  registerChunk: (
    chunkPath: ChunkPath | ChunkScript,
    params?: RuntimeParams
  ) => void
  /**
   * Returns the same Promise for the same chunk URL.
   */
  loadChunkCached: (sourceType: SourceType, chunkUrl: ChunkUrl) => Promise<void>
  loadWebAssembly: (
    sourceType: SourceType,
    sourceData: SourceData,
    wasmChunkPath: ChunkPath,
    edgeModule: () => WebAssembly.Module,
    importsObj: WebAssembly.Imports
  ) => Promise<Exports>
  loadWebAssemblyModule: (
    sourceType: SourceType,
    sourceData: SourceData,
    wasmChunkPath: ChunkPath,
    edgeModule: () => WebAssembly.Module
  ) => Promise<WebAssembly.Module>
}

interface DevRuntimeBackend {
  reloadChunk?: (chunkUrl: ChunkUrl) => Promise<void>
  unloadChunk?: (chunkUrl: ChunkUrl) => void
  restart: () => void
}

const moduleFactories: ModuleFactories = new Map()
contextPrototype.M = moduleFactories

const availableModules: Map<ModuleId, Promise<any> | true> = new Map()

const availableModuleChunks: Map<ChunkPath, Promise<any> | true> = new Map()

function factoryNotAvailableMessage(
  moduleId: ModuleId,
  sourceType: SourceType,
  sourceData: SourceData
): string {
  let instantiationReason
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

function loadChunk(
  this: TurbopackBrowserBaseContext<Module>,
  chunkData: ChunkData
): Promise<void> {
  return loadChunkInternal(SourceType.Parent, this.m.id, chunkData)
}
browserContextPrototype.l = loadChunk

function loadInitialChunk(chunkPath: ChunkPath, chunkData: ChunkData) {
  return loadChunkInternal(SourceType.Runtime, chunkPath, chunkData)
}

async function loadChunkInternal(
  sourceType: SourceType,
  sourceData: SourceData,
  chunkData: ChunkData
): Promise<void> {
  if (typeof chunkData === 'string') {
    return loadChunkPath(sourceType, sourceData, chunkData)
  }

  const includedList = chunkData.included || []
  const modulesPromises = includedList.map((included) => {
    if (moduleFactories.has(included)) return true
    return availableModules.get(included)
  })
  if (modulesPromises.length > 0 && modulesPromises.every((p) => p)) {
    // When all included items are already loaded or loading, we can skip loading ourselves
    await Promise.all(modulesPromises)
    return
  }

  const includedModuleChunksList = chunkData.moduleChunks || []
  const moduleChunksPromises = includedModuleChunksList
    .map((included) => {
      // TODO(alexkirsz) Do we need this check?
      // if (moduleFactories[included]) return true;
      return availableModuleChunks.get(included)
    })
    .filter((p) => p)

  let promise: Promise<unknown>
  if (moduleChunksPromises.length > 0) {
    // Some module chunks are already loaded or loading.

    if (moduleChunksPromises.length === includedModuleChunksList.length) {
      // When all included module chunks are already loaded or loading, we can skip loading ourselves
      await Promise.all(moduleChunksPromises)
      return
    }

    const moduleChunksToLoad: Set<ChunkPath> = new Set()
    for (const moduleChunk of includedModuleChunksList) {
      if (!availableModuleChunks.has(moduleChunk)) {
        moduleChunksToLoad.add(moduleChunk)
      }
    }

    for (const moduleChunkToLoad of moduleChunksToLoad) {
      const promise = loadChunkPath(sourceType, sourceData, moduleChunkToLoad)

      availableModuleChunks.set(moduleChunkToLoad, promise)

      moduleChunksPromises.push(promise)
    }

    promise = Promise.all(moduleChunksPromises)
  } else {
    promise = loadChunkPath(sourceType, sourceData, chunkData.path)

    // Mark all included module chunks as loading if they are not already loaded or loading.
    for (const includedModuleChunk of includedModuleChunksList) {
      if (!availableModuleChunks.has(includedModuleChunk)) {
        availableModuleChunks.set(includedModuleChunk, promise)
      }
    }
  }

  for (const included of includedList) {
    if (!availableModules.has(included)) {
      // It might be better to race old and new promises, but it's rare that the new promise will be faster than a request started earlier.
      // In production it's even more rare, because the chunk optimization tries to deduplicate modules anyway.
      availableModules.set(included, promise)
    }
  }

  await promise
}

const loadedChunk = Promise.resolve(undefined)
const instrumentedBackendLoadChunks = new WeakMap<
  Promise<any>,
  Promise<any> | typeof loadedChunk
>()
// Do not make this async. React relies on referential equality of the returned Promise.
function loadChunkByUrl(
  this: TurbopackBrowserBaseContext<Module>,
  chunkUrl: ChunkUrl
) {
  return loadChunkByUrlInternal(SourceType.Parent, this.m.id, chunkUrl)
}
browserContextPrototype.L = loadChunkByUrl

// Do not make this async. React relies on referential equality of the returned Promise.
function loadChunkByUrlInternal(
  sourceType: SourceType,
  sourceData: SourceData,
  chunkUrl: ChunkUrl
): Promise<any> {
  const thenable = BACKEND.loadChunkCached(sourceType, chunkUrl)
  let entry = instrumentedBackendLoadChunks.get(thenable)
  if (entry === undefined) {
    const resolve = instrumentedBackendLoadChunks.set.bind(
      instrumentedBackendLoadChunks,
      thenable,
      loadedChunk
    )
    entry = thenable.then(resolve).catch((cause) => {
      let loadReason: string
      switch (sourceType) {
        case SourceType.Runtime:
          loadReason = `as a runtime dependency of chunk ${sourceData}`
          break
        case SourceType.Parent:
          loadReason = `from module ${sourceData}`
          break
        case SourceType.Update:
          loadReason = 'from an HMR update'
          break
        default:
          invariant(
            sourceType,
            (sourceType) => `Unknown source type: ${sourceType}`
          )
      }
      let error = new Error(
        `Failed to load chunk ${chunkUrl} ${loadReason}${
          cause ? `: ${cause}` : ''
        }`,
        cause ? { cause } : undefined
      )
      error.name = 'ChunkLoadError'
      throw error
    })
    instrumentedBackendLoadChunks.set(thenable, entry)
  }

  return entry
}

// Do not make this async. React relies on referential equality of the returned Promise.
function loadChunkPath(
  sourceType: SourceType,
  sourceData: SourceData,
  chunkPath: ChunkPath
): Promise<void> {
  const url = getChunkRelativeUrl(chunkPath)
  return loadChunkByUrlInternal(sourceType, sourceData, url)
}

/**
 * Returns an absolute url to an asset.
 */
function resolvePathFromModule(
  this: TurbopackBaseContext<Module>,
  moduleId: string
): string {
  const exported = this.r(moduleId)
  return exported?.default ?? exported
}
browserContextPrototype.R = resolvePathFromModule

/**
 * no-op for browser
 * @param modulePath
 */
function resolveAbsolutePath(modulePath?: string): string {
  return `/ROOT/${modulePath ?? ''}`
}
browserContextPrototype.P = resolveAbsolutePath

/**
 * Exports a URL with the static suffix appended.
 */
function exportUrl(
  this: TurbopackBrowserBaseContext<Module>,
  url: string,
  id: ModuleId | undefined
) {
  exportValue.call(this, `${url}${ASSET_SUFFIX}`, id)
}
browserContextPrototype.q = exportUrl

/**
 * Creates a worker by instantiating the given WorkerConstructor with the
 * appropriate URL and options.
 *
 * The entrypoint is a pre-compiled worker runtime file. The params configure
 * which module chunks to load and which module to run as the entry point.
 *
 * The params are a JSON array of the following structure:
 * `[TURBOPACK_NEXT_CHUNK_URLS, ASSET_SUFFIX, ...WORKER_FORWARDED_GLOBALS values]`
 *
 * @param WorkerConstructor The Worker or SharedWorker constructor
 * @param entrypoint URL path to the worker entrypoint chunk
 * @param moduleChunks list of module chunk paths to load
 * @param workerOptions options to pass to the Worker constructor (optional)
 */
function createWorker(
  WorkerConstructor: { new (url: URL, options?: object): Worker },
  entrypoint: ChunkPath,
  moduleChunks: ChunkPath[],
  workerOptions?: object
): Worker {
  const isSharedWorker = WorkerConstructor.name === 'SharedWorker'

  const chunkUrls = moduleChunks
    .map((chunk) => getChunkRelativeUrl(chunk))
    .reverse()
  const params: unknown[] = [chunkUrls, ASSET_SUFFIX]
  for (const globalName of WORKER_FORWARDED_GLOBALS) {
    params.push((globalThis as Record<string, unknown>)[globalName])
  }

  const url = new URL(getChunkRelativeUrl(entrypoint), location.origin)
  const paramsJson = JSON.stringify(params)
  if (isSharedWorker) {
    url.searchParams.set('params', paramsJson)
  } else {
    url.hash = '#params=' + encodeURIComponent(paramsJson)
  }

  // Remove type: "module" from options since our worker entrypoint is not a module
  const options = workerOptions
    ? { ...workerOptions, type: undefined }
    : undefined
  return new WorkerConstructor(url, options)
}
browserContextPrototype.b = createWorker

/**
 * Instantiates a runtime module.
 */
function instantiateRuntimeModule(
  moduleId: ModuleId,
  chunkPath: ChunkPath
): Module {
  return instantiateModule(moduleId, SourceType.Runtime, chunkPath)
}
/**
 * Returns the URL relative to the origin where a chunk can be fetched from.
 */
function getChunkRelativeUrl(chunkPath: ChunkPath | ChunkListPath): ChunkUrl {
  return `${CHUNK_BASE_PATH}${chunkPath
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/')}${ASSET_SUFFIX}` as ChunkUrl
}

/**
 * Return the ChunkPath from a ChunkScript.
 */
function getPathFromScript(chunkScript: ChunkPath | ChunkScript): ChunkPath
function getPathFromScript(
  chunkScript: ChunkListPath | ChunkListScript
): ChunkListPath
function getPathFromScript(
  chunkScript: ChunkPath | ChunkListPath | ChunkScript | ChunkListScript
): ChunkPath | ChunkListPath {
  if (typeof chunkScript === 'string') {
    return chunkScript as ChunkPath | ChunkListPath
  }
  const chunkUrl = chunkScript.src!
  const src = decodeURIComponent(chunkUrl.replace(/[?#].*$/, ''))
  const path = src.startsWith(CHUNK_BASE_PATH)
    ? src.slice(CHUNK_BASE_PATH.length)
    : src
  return path as ChunkPath | ChunkListPath
}

/**
 * Return the ChunkUrl from a ChunkScript.
 */
function getUrlFromScript(chunk: ChunkPath | ChunkScript): ChunkUrl {
  if (typeof chunk === 'string') {
    return getChunkRelativeUrl(chunk)
  } else {
    // This is already exactly what we want
    return chunk.src! as ChunkUrl
  }
}

/**
 * Determine the chunk to register. Note that this function has side-effects!
 */
function getChunkFromRegistration(
  chunk: ChunkRegistrationChunk
): ChunkPath | CurrentScript {
  if (typeof chunk === 'string') {
    return chunk
  } else if (!chunk) {
    if (typeof TURBOPACK_NEXT_CHUNK_URLS !== 'undefined') {
      return { src: TURBOPACK_NEXT_CHUNK_URLS.pop()! } as CurrentScript
    } else {
      throw new Error('chunk path empty but not in a worker')
    }
  } else {
    return { src: chunk.getAttribute('src')! } as CurrentScript
  }
}

const regexJsUrl = /\.js(?:\?[^#]*)?(?:#.*)?$/
/**
 * Checks if a given path/URL ends with .js, optionally followed by ?query or #fragment.
 */
function isJs(chunkUrlOrPath: ChunkUrl | ChunkPath): boolean {
  return regexJsUrl.test(chunkUrlOrPath)
}

const regexCssUrl = /\.css(?:\?[^#]*)?(?:#.*)?$/
/**
 * Checks if a given path/URL ends with .css, optionally followed by ?query or #fragment.
 */
function isCss(chunkUrl: ChunkUrl): boolean {
  return regexCssUrl.test(chunkUrl)
}

function loadWebAssembly(
  this: TurbopackBaseContext<Module>,
  chunkPath: ChunkPath,
  edgeModule: () => WebAssembly.Module,
  importsObj: WebAssembly.Imports
): Promise<Exports> {
  return BACKEND.loadWebAssembly(
    SourceType.Parent,
    this.m.id,
    chunkPath,
    edgeModule,
    importsObj
  )
}
contextPrototype.w = loadWebAssembly

function loadWebAssemblyModule(
  this: TurbopackBaseContext<Module>,
  chunkPath: ChunkPath,
  edgeModule: () => WebAssembly.Module
): Promise<WebAssembly.Module> {
  return BACKEND.loadWebAssemblyModule(
    SourceType.Parent,
    this.m.id,
    chunkPath,
    edgeModule
  )
}
contextPrototype.u = loadWebAssemblyModule
