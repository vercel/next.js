import type { AppPageModule } from '../route-modules/app-page/module'
import { wrapClientComponentLoader } from '../client-component-renderer-logger'
import { getTracer } from '../lib/trace/tracer'
import { workUnitAsyncStorage } from './work-unit-async-storage.external'
import {
  trackPendingChunkLoad,
  trackPendingImport,
} from './module-loading/track-module-loading.external'

type ModuleLoadingGlobal = typeof globalThis & {
  __next_require__: AppPageModule['__next_app__']['require']
  __next_chunk_load__: AppPageModule['__next_app__']['loadChunk']
}

/**
 * Extracted to a separate function to prevent V8 from retaining the entire
 * `prepareAppPageRender` closure scope through globalThis.__next_require__.
 * V8 shares a single Context object per scope for all closures; by creating
 * these closures in their own function scope, the globalThis references only
 * retain `instrumented` and `cacheComponents`, not request-specific data like
 * req/res/workStore.
 */
export function installGlobalModuleLoadingHandlers(
  ComponentMod: Pick<AppPageModule, '__next_app__'>,
  cacheComponents: boolean,
  isTracingEnabled = getTracer().getActiveScopeSpan()?.isRecording() ?? false
) {
  const instrumented = wrapClientComponentLoader(ComponentMod, isTracingEnabled)

  // When we are prerendering if there is a cacheSignal for tracking
  // cache reads we track calls to `loadChunk` and `require`. This allows us
  // to treat chunk/module loading with similar semantics as cache reads to avoid
  // module loading from causing a prerender to abort too early.
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
      case 'generate-static-params':
        return false
      default:
        workUnitStore satisfies never
    }
  }

  ;(globalThis as ModuleLoadingGlobal).__next_require__ = (
    ...args: Parameters<typeof instrumented.require>
  ) => {
    const exportsOrPromise = instrumented.require(...args)
    if (shouldTrackModuleLoading()) {
      trackPendingImport(exportsOrPromise)
    }
    return exportsOrPromise
  }
  ;(globalThis as ModuleLoadingGlobal).__next_chunk_load__ = (
    ...args: Parameters<typeof instrumented.loadChunk>
  ) => {
    const loadingChunk = instrumented.loadChunk(...args)
    if (shouldTrackModuleLoading()) {
      trackPendingChunkLoad(loadingChunk)
    }
    return loadingChunk
  }
}
