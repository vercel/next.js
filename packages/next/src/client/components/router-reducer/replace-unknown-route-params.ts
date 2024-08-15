import type {
  CacheNodeSeedData,
  FlightRouterState,
} from '../../../server/app-render/types'
import {
  getFallbackDynamicParamTypeShort,
  isFallbackDynamicParamTypeShort,
} from '../../../server/app-render/fallbacks'

/**
 * Replaces the unknown route params in the tree and seed data with the provided
 * values using a breadth-first search.
 *
 * @param tree The tree to replace the unknown route params in.
 * @param seedData The seed data to replace the unknown route params in.
 * @param unknownRouteParams The unknown route params to replace.
 */
export function replaceUnknownRouteParams(
  tree: FlightRouterState,
  seedData: CacheNodeSeedData | null,
  unknownRouteParams: Map<string, string | string[]>
) {
  const stack: Array<[FlightRouterState, CacheNodeSeedData | null]> = [
    [tree, seedData],
  ]

  while (stack.length > 0) {
    const [currentTree, currentSeedData] = stack.pop()!
    const [segment, parallelRoutes] = currentTree

    if (
      typeof segment !== 'string' &&
      isFallbackDynamicParamTypeShort(segment[2])
    ) {
      let value = unknownRouteParams.get(segment[0])
      if (!value) {
        throw new Error(
          `The provided \`unknownRouteParams\` does not specify a value for the route parameter "${segment[0]}"`
        )
      }

      if (Array.isArray(value)) {
        value = value.map((i) => encodeURIComponent(i)).join('/')
      } else {
        value = encodeURIComponent(value)
      }

      segment[1] = value

      // We remove the f prefix from the type, since it's not needed anymore
      // because we've filled in the value.
      const type = getFallbackDynamicParamTypeShort(segment[2])

      segment[2] = type

      // Apply the same changes to the seed data.
      if (currentSeedData && typeof currentSeedData[0] !== 'string') {
        currentSeedData[0][1] = value
        currentSeedData[0][2] = type
      }
    }

    // For each of the parallel routes, we need to replace the unknown route
    // params in the tree.
    for (const key in parallelRoutes) {
      // If the parallel route doesn't exist, we can skip it.
      if (!parallelRoutes[key]) continue

      // Process each of the parallel routes by pushing them onto the stack.
      stack.push([
        parallelRoutes[key],
        currentSeedData ? currentSeedData[2][key] : null,
      ])
    }
  }
}
