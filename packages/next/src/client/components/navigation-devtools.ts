import type { FlightRouterState } from '../../shared/lib/app-router-types'
import {
  createDevToolsInstrumentedPromise,
  type InstrumentedPromise,
} from '../../shared/lib/hooks-client-context.shared-runtime'
import {
  computeSelectedLayoutSegment,
  getSelectedLayoutSegmentPath,
} from '../../shared/lib/segment'

/**
 * Creates instrumented promises for layout segment hooks at a given tree level.
 * This is dev-only code for React Suspense DevTools instrumentation.
 */
export function createLayoutSegmentPromises(tree: FlightRouterState): {
  selectedLayoutSegmentPromises: Map<string, InstrumentedPromise<string | null>>
  selectedLayoutSegmentsPromises: Map<string, InstrumentedPromise<string[]>>
} {
  const segmentPromises = new Map<string, InstrumentedPromise<string | null>>()
  const segmentsPromises = new Map<string, InstrumentedPromise<string[]>>()

  const parallelRoutes = tree[1]
  for (const parallelRouteKey of Object.keys(parallelRoutes)) {
    const segments = getSelectedLayoutSegmentPath(tree, parallelRouteKey)

    // Use the shared logic to compute the segment value
    const segment = computeSelectedLayoutSegment(segments, parallelRouteKey)

    segmentPromises.set(
      parallelRouteKey,
      createDevToolsInstrumentedPromise('useSelectedLayoutSegment', segment)
    )
    segmentsPromises.set(
      parallelRouteKey,
      createDevToolsInstrumentedPromise('useSelectedLayoutSegments', segments)
    )
  }

  return {
    selectedLayoutSegmentPromises: segmentPromises,
    selectedLayoutSegmentsPromises: segmentsPromises,
  }
}
