import type { AppPageModule } from '../route-modules/app-page/module'
import { wrapClientComponentLoader } from '../client-component-renderer-logger'
import { workAsyncStorage } from './work-async-storage.external'
import { workUnitAsyncStorage } from './work-unit-async-storage.external'
import {
  trackPendingChunkLoad,
  trackPendingImport,
} from './module-loading/track-module-loading.external'

type LoadChunk = AppPageModule['__next_app__']['loadChunk']
type LoadedChunks = Map<Parameters<LoadChunk>[0], ReturnType<LoadChunk>>

// Chunk loads that completed, per page loader. Outside of development a chunk
// that has loaded stays loaded, and the bundler runtime answers every later
// request for it with an already settled promise. React asks for every chunk
// of every client reference on every render, so remembering the settled
// promise saves a trip through the load tracker and the bundler runtime.
//
// Keyed by `__next_app__`, which is created once per page entry. The
// `ComponentMod` object around it is rebuilt for every request.
const loadedChunksByLoader = new WeakMap<
  AppPageModule['__next_app__'],
  LoadedChunks
>()

function getLoadedChunks(ComponentMod: AppPageModule): LoadedChunks | null {
  if (process.env.__NEXT_DEV_SERVER) {
    // Chunks can be replaced while the dev server runs.
    return null
  }
  const loader = ComponentMod.__next_app__
  let loadedChunks = loadedChunksByLoader.get(loader)
  if (loadedChunks === undefined) {
    loadedChunks = new Map()
    loadedChunksByLoader.set(loader, loadedChunks)
  }
  return loadedChunks
}

function noop() {}

// Mirrors the check in `wrapClientComponentLoader`: while a render measures
// client component loading, every load has to go through the tracker.
function isLoadTimingTracked(): boolean {
  const tracker = workAsyncStorage.getStore()?.clientComponentLoadTracker
  return tracker !== undefined && !tracker.isSealed()
}

/**
 * Keep these closures in their own scope so the globals only retain the loader
 * and cacheComponents, rather than request-specific rendering data.
 */
export function installGlobalModuleLoadingHandlers(
  ComponentMod: AppPageModule,
  cacheComponents: boolean
) {
  const instrumented = wrapClientComponentLoader(ComponentMod)
  const loadedChunks = getLoadedChunks(ComponentMod)

  // Track module loading like cache reads so prerendering doesn't abort early.
  const shouldTrackModuleLoading = () => {
    if (!cacheComponents) {
      return false
    }
    if (process.env.__NEXT_DEV_SERVER) {
      return true
    }
    const workUnitStore = workUnitAsyncStorage.getStore()

    if (!workUnitStore) {
      return false
    }

    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-client':
      case 'validation-client':
      case 'prerender-runtime':
      case 'cache':
      case 'private-cache':
        return true
      case 'prerender-legacy':
      case 'request':
      case 'unstable-cache':
      case 'build-time-generator':
        return false
      default:
        workUnitStore satisfies never
    }
  }

  // @ts-expect-error
  globalThis.__next_require__ = (
    ...args: Parameters<typeof instrumented.require>
  ) => {
    const exportsOrPromise = instrumented.require(...args)
    if (shouldTrackModuleLoading()) {
      trackPendingImport(exportsOrPromise)
    }
    return exportsOrPromise
  }

  // @ts-expect-error
  globalThis.__next_chunk_load__ = (
    ...args: Parameters<typeof instrumented.loadChunk>
  ) => {
    const chunkId = args[0]
    let loadingChunk =
      loadedChunks !== null ? loadedChunks.get(chunkId) : undefined
    if (loadingChunk === undefined || isLoadTimingTracked()) {
      const pendingChunk = instrumented.loadChunk(...args)
      if (loadedChunks !== null && !loadedChunks.has(chunkId)) {
        // Only a successful load is remembered, and the promise itself is
        // kept because React relies on its identity.
        pendingChunk.then(() => {
          loadedChunks.set(chunkId, pendingChunk)
        }, noop)
      }
      loadingChunk = pendingChunk
    }
    if (shouldTrackModuleLoading()) {
      trackPendingChunkLoad(loadingChunk)
    }
    return loadingChunk
  }
}
