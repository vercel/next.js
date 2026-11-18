import type { AppPageModule } from '../route-modules/app-page/module'
import { wrapClientComponentLoader } from '../client-component-renderer-logger'
import { workUnitAsyncStorage } from './work-unit-async-storage.external'
import {
  trackPendingChunkLoad,
  trackPendingImport,
} from './module-loading/track-module-loading.external'

/**
 * Keep these closures in their own scope so the globals only retain the loader
 * and cacheComponents, rather than request-specific rendering data.
 */
export function installGlobalModuleLoadingHandlers(
  ComponentMod: AppPageModule,
  cacheComponents: boolean
) {
  const instrumented = wrapClientComponentLoader(ComponentMod)

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
    const loadingChunk = instrumented.loadChunk(...args)
    if (shouldTrackModuleLoading()) {
      trackPendingChunkLoad(loadingChunk)
    }
    return loadingChunk
  }
}
