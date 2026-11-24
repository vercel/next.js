import type { PrerenderManifestRoute } from '../../build'
import { RenderingMode } from '../../build/rendering-mode'

/**
 * Determine build-time completeness for full-route RSC responses.
 */
export function getRscPrerenderCompleteness(
  route:
    | Pick<
        PrerenderManifestRoute,
        'renderingMode' | 'prefetchDataRoute' | 'response'
      >
    | undefined
): 'complete' | 'empty' | undefined {
  if (route === undefined || route.response === undefined) {
    return undefined
  }

  if (route.renderingMode === RenderingMode.PARTIALLY_STATIC) {
    // PPR entries set prefetchDataRoute only for complete static RSC payloads.
    return route.prefetchDataRoute ? 'complete' : 'empty'
  }

  return route.response === 'complete' ? 'complete' : 'empty'
}
