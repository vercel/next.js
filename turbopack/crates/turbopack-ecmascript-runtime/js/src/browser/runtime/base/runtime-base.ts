/**
 * This file contains runtime types and functions that are shared between all
 * Turbopack *development* ECMAScript runtimes.
 *
 * It will be appended to the runtime code of each runtime right after the
 * shared runtime utils.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../base/globals.d.ts" />
/// <reference path="../../../shared/runtime-utils.ts" />

// Used in WebWorkers to tell the runtime about the chunk base path
declare var TURBOPACK_WORKER_LOCATION: string
// Used in WebWorkers to tell the runtime about the current chunk url since it can't be detected via document.currentScript
// Note it's stored in reversed order to use push and pop
declare var TURBOPACK_NEXT_CHUNK_URLS: ChunkUrl[] | undefined

// Injected by rust code
declare var CHUNK_BASE_PATH: string
declare var CHUNK_SUFFIX_PATH: string

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

type ChunkRegistration = [
  chunkPath: ChunkScript,
  ...([RuntimeParams] | CompressedModuleFactories),
]

type ChunkList = {
  script: ChunkListScript
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
  registerChunk: (chunkPath: ChunkPath, params?: RuntimeParams) => void
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
    entry = thenable.then(resolve).catch((error) => {
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
      throw new Error(
        `Failed to load chunk ${chunkUrl} ${loadReason}${
          error ? `: ${error}` : ''
        }`,
        error
          ? {
              cause: error,
            }
          : undefined
      )
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
 * Returns a blob URL for the worker.
 * @param chunks list of chunks to load
 */
function getWorkerBlobURL(chunks: ChunkPath[]): string {
  // It is important to reverse the array so when bootstrapping we can infer what chunk is being
  // evaluated by poping urls off of this array.  See `getPathFromScript`
  let bootstrap = `self.TURBOPACK_WORKER_LOCATION = ${JSON.stringify(location.origin)};
self.TURBOPACK_NEXT_CHUNK_URLS = ${JSON.stringify(chunks.reverse().map(getChunkRelativeUrl), null, 2)};
importScripts(...self.TURBOPACK_NEXT_CHUNK_URLS.map(c => self.TURBOPACK_WORKER_LOCATION + c).reverse());`
  let blob = new Blob([bootstrap], { type: 'text/javascript' })
  return URL.createObjectURL(blob)
}
browserContextPrototype.b = getWorkerBlobURL

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
    .join('/')}${CHUNK_SUFFIX_PATH}` as ChunkUrl
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
  const chunkUrl =
    typeof TURBOPACK_NEXT_CHUNK_URLS !== 'undefined'
      ? TURBOPACK_NEXT_CHUNK_URLS.pop()!
      : chunkScript.getAttribute('src')!
  const src = decodeURIComponent(chunkUrl.replace(/[?#].*$/, ''))
  const path = src.startsWith(CHUNK_BASE_PATH)
    ? src.slice(CHUNK_BASE_PATH.length)
    : src
  return path as ChunkPath | ChunkListPath
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
