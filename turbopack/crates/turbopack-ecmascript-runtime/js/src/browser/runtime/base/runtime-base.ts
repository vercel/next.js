/**
 * This file contains runtime types and functions that are shared between all
 * Turbopack *browser* ECMAScript runtimes.
 *
 * It will be appended to the runtime code of each runtime right after the
 * shared runtime utils.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../base/globals.d.ts" />
/// <reference path="../../../shared/runtime/runtime-utils.ts" />

// Used in WebWorkers to tell the runtime about the chunk suffix
declare var TURBOPACK_ASSET_SUFFIX: string
// Used in WebWorkers to tell the runtime about the current chunk url since it
// can't be detected via `document.currentScript`. Note it's stored in reversed
// order to use `push` and `pop`
declare var TURBOPACK_NEXT_CHUNK_URLS: ChunkUrl[] | undefined

// Injected by rust code
declare var CHUNK_BASE_PATH: string
declare var ASSET_SUFFIX: string
declare var CROSS_ORIGIN: 'anonymous' | 'use-credentials' | null
declare var CHUNK_LOAD_RETRY_MAX_ATTEMPTS: number
declare var CHUNK_LOAD_RETRY_BASE_DELAY_MS: number
declare var CHUNK_LOAD_RETRY_MAX_JITTER_MS: number

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

interface RuntimeBackend {
  registerChunk: (
    chunkPath: ChunkPath | ChunkScript,
    params?: RuntimeParams
  ) => void
  /**
   * Returns the same Promise for the same chunk URL.
   */
  loadChunkCached: (sourceType: SourceType, chunkUrl: ChunkUrl) => Promise<void>
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

// Registry mapping a merged chunk's path to its constituent component chunk paths.
const chunkComponents: Map<ChunkPath, ChunkPath[]> = new Map()

type ChunkUrlOrMerged = ChunkUrl | [ChunkUrl, ChunkPath[]]

// Memoizes the composite promise returned for a merged chunk loaded by URL, keyed by URL.
const splitChunkPromises: Map<ChunkUrl, Promise<any>> = new Map()

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

  const componentChunks = chunkData.moduleChunks || []
  // We already have this chunk's component list inline (chunkData.moduleChunks) and split on it
  // here, so the whole-chunk fallback uses loadChunkByUrlWhole to skip loadChunkByUrlInternal's
  // chunkComponents-registry lookup, which would just repeat the same split decision.
  const promise = loadComponentChunksOrWhole(
    sourceType,
    sourceData,
    componentChunks,
    getChunkRelativeUrl(chunkData.path)
  )

  for (const included of includedList) {
    if (!availableModules.has(included)) {
      // It might be better to race old and new promises, but it's rare that the new promise will be faster than a request started earlier.
      // In production it's even more rare, because the chunk optimization tries to deduplicate modules anyway.
      availableModules.set(included, promise)
    }
  }

  await promise
}

/**
 * Loads a chunk's component chunks individually when at least one is already available
 * in memory (avoiding re-downloading the ones we have), otherwise loads the whole chunk
 * from `chunkUrl` and records its component chunks as available.
 */
function loadComponentChunksOrWhole(
  sourceType: SourceType,
  sourceData: SourceData,
  componentChunks: ChunkPath[],
  chunkUrl: ChunkUrl
): Promise<unknown> {
  const componentChunkPromises = componentChunks
    .map((componentChunk) => availableModuleChunks.get(componentChunk))
    .filter((p) => p) as Array<Promise<any> | true>

  if (componentChunkPromises.length > 0) {
    // At least one component chunk is already loaded or loading. Splitting avoids
    // re-downloading the ones we already have.
    for (const componentChunk of componentChunks) {
      if (!availableModuleChunks.has(componentChunk)) {
        const promise = loadChunkPath(sourceType, sourceData, componentChunk)
        availableModuleChunks.set(componentChunk, promise)
        componentChunkPromises.push(promise)
      }
    }
    return Promise.all(componentChunkPromises)
  }

  // No component chunk is available in memory, so splitting would save nothing. Load the
  // whole chunk in a single request and record its component chunks as available.
  const promise = loadChunkByUrlWhole(sourceType, sourceData, chunkUrl)
  for (const componentChunk of componentChunks) {
    if (!availableModuleChunks.has(componentChunk)) {
      availableModuleChunks.set(componentChunk, promise)
    }
  }
  return promise
}

const loadedChunk = Promise.resolve(undefined)
const instrumentedBackendLoadChunks = new WeakMap<
  Promise<any>,
  Promise<any> | typeof loadedChunk
>()
// Do not make this async. React relies on referential equality of the returned Promise.
function loadChunkByUrl(
  this: TurbopackBrowserBaseContext<Module>,
  chunkEntry: ChunkUrlOrMerged
) {
  return loadChunkByUrlInternal(SourceType.Parent, this.m.id, chunkEntry)
}
browserContextPrototype.L = loadChunkByUrl

// Do not make this async. React relies on referential equality of the returned Promise.
function loadChunkByUrlInternal(
  sourceType: SourceType,
  sourceData: SourceData,
  chunkEntry: ChunkUrlOrMerged
): Promise<any> {
  // A merged chunk arrives as a `[url, componentChunkPaths]` array. Register
  // the components so a by-URL load of this merged chunk — now or from a later navigation — can
  // be split, and so `registerChunk` can mark them available when the whole chunk loads.
  let chunkUrl: ChunkUrl
  let components: ChunkPath[] | undefined
  if (typeof chunkEntry === 'string') {
    chunkUrl = chunkEntry
  } else {
    ;[chunkUrl, components] = chunkEntry
  }
  const chunkPath = chunkUrlToPath(chunkUrl)
  if (components !== undefined) {
    chunkComponents.set(chunkPath, components)
  } else {
    // A plain URL may still be a merged chunk we already registered from its array.
    components = chunkComponents.get(chunkPath)
  }

  // If we have component chunks for this merged chunk, load only the ones we don't already have
  // instead of the whole merged chunk.
  if (components !== undefined) {
    let promise = splitChunkPromises.get(chunkUrl)
    if (promise === undefined) {
      promise = loadComponentChunksOrWhole(
        sourceType,
        sourceData,
        components,
        chunkUrl
      )
      splitChunkPromises.set(chunkUrl, promise)
    }
    return promise
  }

  // This is a non-merged chunk. If its modules were already loaded — e.g. this chunk is a component
  // of a merged chunk fetched on a previous navigation — reuse that load instead of re-downloading.
  const existing = availableModuleChunks.get(chunkPath)
  if (existing !== undefined) {
    return existing === true ? loadedChunk : existing
  }
  const promise = loadChunkByUrlWhole(sourceType, sourceData, chunkUrl)
  availableModuleChunks.set(chunkPath, promise)
  return promise
}

// Convert a chunk URL back to its ChunkPath (strip base path, query/hash, decode), to
// match the keys stored in `chunkComponents`.
function chunkUrlToPath(chunkUrl: ChunkUrl): ChunkPath {
  const src = decodeURIComponent(chunkUrl.replace(/[?#].*$/, ''))
  return (
    src.startsWith(CHUNK_BASE_PATH) ? src.slice(CHUNK_BASE_PATH.length) : src
  ) as ChunkPath
}

/**
 * When a merged chunk finishes registering (e.g. an initial-load `<script>`), mark its
 * component chunks as available so a later by-URL load of a *different* merged chunk that
 * shares a component skips re-downloading it. Called from `registerChunk`.
 */

function markChunkComponentsAvailable(chunk: ChunkPath | ChunkScript) {
  if (chunkComponents.size === 0) return
  const components = chunkComponents.get(getPathFromScript(chunk))
  if (components === undefined) return
  for (const componentChunk of components) {
    if (!availableModuleChunks.has(componentChunk)) {
      availableModuleChunks.set(componentChunk, true)
    }
  }
}

// Do not make this async. React relies on referential equality of the returned Promise.
function loadChunkByUrlWhole(
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
 * Returns a placeholder `file://` URL for the given module path. The browser
 * runtime intentionally does not expose the real filesystem path. Path
 * segments are percent-encoded so the result is always a valid file URI.
 */
function resolveFileUrl(modulePath?: string): string {
  if (!modulePath) return 'file:///ROOT/'
  return `file:///ROOT/${modulePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}
browserContextPrototype.F = resolveFileUrl

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
function getChunkRelativeUrl(
  chunkPath: ChunkPath | ChunkListPath,
  basePath: string = CHUNK_BASE_PATH
): ChunkUrl {
  return `${basePath}${chunkPath
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/')}${ASSET_SUFFIX}` as ChunkUrl
}

// Shared runtime primitives consumed by the bundled `createWorker` helper,
// exposed as `__turbopack_chunk_base_path__` and `__turbopack_chunk_asset_suffix__`.
browserContextPrototype.b = CHUNK_BASE_PATH as ChunkBasePath
browserContextPrototype.X = ASSET_SUFFIX as AssetSuffix

// Shared runtime primitive: build a chunk's URL. Used by the bundled worker
// helper and the WASM helper, exposed as `__turbopack_chunk_relative_url__`.
browserContextPrototype.h = getChunkRelativeUrl

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

/**
 * Checks if a given path/URL ends with the given extension,
 * optionally followed by ?query or #fragment.
 */
function endsWithExtension(
  chunkUrlOrPath: ChunkUrl | ChunkPath,
  ext: string
): boolean {
  // Find where the path ends (before query or fragment)
  const q = chunkUrlOrPath.indexOf('?')
  let end: number
  if (q !== -1) {
    end = q
  } else {
    const h = chunkUrlOrPath.indexOf('#')
    end = h !== -1 ? h : chunkUrlOrPath.length
  }
  // Check if the path portion ends with the extension
  return end >= ext.length && chunkUrlOrPath.startsWith(ext, end - ext.length)
}

function isJs(chunkUrlOrPath: ChunkUrl | ChunkPath): boolean {
  return endsWithExtension(chunkUrlOrPath, '.js')
}

function isCss(chunkUrl: ChunkUrl): boolean {
  return endsWithExtension(chunkUrl, '.css')
}
