import type { AppPageModule } from '../route-modules/app-page/module'
import { wrapClientComponentLoader } from '../client-component-renderer-logger'
import { workUnitAsyncStorage } from './work-unit-async-storage.external'
import {
  trackPendingChunkLoad,
  trackPendingImport,
} from './module-loading/track-module-loading.external'

type InstrumentedLoader = ReturnType<typeof wrapClientComponentLoader>

/**
 * The globals only retain the loader and cacheComponents, rather than
 * request-specific rendering data. They are bound functions, not function
 * expressions: V8 allocates a function expression that is assigned to a
 * property in the old generation, where every replaced handler would keep its
 * loader alive until the next major garbage collection.
 */
export function installGlobalModuleLoadingHandlers(
  ComponentMod: AppPageModule,
  cacheComponents: boolean
) {
  const instrumented = wrapClientComponentLoader(ComponentMod)

  // @ts-expect-error
  globalThis.__next_require__ = requireModule.bind(
    null,
    instrumented,
    cacheComponents
  )

  // @ts-expect-error
  globalThis.__next_chunk_load__ = loadChunk.bind(
    null,
    instrumented,
    cacheComponents
  )
}

// Track module loading like cache reads so prerendering doesn't abort early.
function shouldTrackModuleLoading(cacheComponents: boolean) {
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

function requireModule(
  instrumented: InstrumentedLoader,
  cacheComponents: boolean,
  ...args: Parameters<InstrumentedLoader['require']>
) {
  const exportsOrPromise = instrumented.require(...args)
  if (shouldTrackModuleLoading(cacheComponents)) {
    trackPendingImport(exportsOrPromise)
  }
  return exportsOrPromise
}

function loadChunk(
  instrumented: InstrumentedLoader,
  cacheComponents: boolean,
  ...args: Parameters<InstrumentedLoader['loadChunk']>
) {
  const loadingChunk = instrumented.loadChunk(...args)
  if (shouldTrackModuleLoading(cacheComponents)) {
    trackPendingChunkLoad(loadingChunk)
  }
  return loadingChunk
}
