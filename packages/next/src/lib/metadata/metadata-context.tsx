import type { AppRenderContext } from '../../server/app-render/app-render'
import type { MetadataContext } from './types/resolvers'
import type { WorkStore } from '../../server/app-render/work-async-storage.external'
import { trackFallbackParamAccessed } from '../../server/app-render/dynamic-rendering'

export function createMetadataContext(
  pathname: string,
  renderOpts: AppRenderContext['renderOpts']
): MetadataContext {
  return {
    pathname,
    trailingSlash: renderOpts.trailingSlash,
    isStaticMetadataRouteFile: false,
  }
}

export function createTrackedMetadataContext(
  pathname: string,
  renderOpts: AppRenderContext['renderOpts'],
  workStore: WorkStore | null
): MetadataContext {
  return {
    // Use the regular metadata context, but we trap the pathname access.
    ...createMetadataContext(pathname, renderOpts),

    // Setup the trap around the pathname access so we can track when the
    // pathname is accessed while resolving metadata which would indicate it's
    // being used to resolve a relative URL. If that's the case, we don't want
    // to provide it, and instead we should error.
    get pathname() {
      if (
        workStore &&
        workStore.isStaticGeneration &&
        workStore.fallbackRouteParams &&
        workStore.fallbackRouteParams.size > 0
      ) {
        trackFallbackParamAccessed(workStore, 'metadata relative url resolving')
      }

      return pathname
    },
  }
}
