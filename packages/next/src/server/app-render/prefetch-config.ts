import type {
  AppSegmentConfig,
  Prefetch,
} from '../../build/segment-config/app/app-segment-config'
import { parseLoaderTree } from '../../shared/lib/router/utils/parse-loader-tree'
import type { NextConfigComplete } from '../config-shared'
import { getLayoutOrPageModule, type LoaderTree } from '../lib/app-dir-module'

/**
 * Partial Prefetching is enabled if
 * - `partialPrefetching` is set globally in the config
 * - a segment included in the route has a `prefetch` config that enables
 *   Partial Prefetching: 'partial' or 'unstable_eager'.
 */
export async function routeHasPartialPrefetchingEnabled(
  tree: LoaderTree,
  globalConfig: NextConfigComplete['partialPrefetching'] | undefined
): Promise<boolean> {
  const config = await resolvePartialPrefetchingConfigForRoute(
    tree,
    globalConfig
  )
  return config !== false
}

export type ResolvedPartialPrefetching = false | true | 'unstable_eager'

/**
 * Resolves the route-level prefetching strategy.
 * Segment-level configs get precedence to allow gradual opt-in.
 * If one segment defines 'partial' and another defines 'unstable_eager',
 * we prioritize the higher level, i.e. we pick 'unstable_eager'.
 * If no segment-level configs are found, we fall back to the global config.
 */
export async function resolvePartialPrefetchingConfigForRoute(
  tree: LoaderTree,
  globalConfig: NextConfigComplete['partialPrefetching'] | undefined
): Promise<ResolvedPartialPrefetching> {
  // NOTE: in theory we could cache the whole result, but it's more straightforward to
  // cache only the part that walks the loader tree, because we can just use a weakmap.
  const level = await resolvePartialPrefetchingLevelFromSegments(tree)
  switch (level) {
    case PartialPrefetchingLevel.Unspecified:
      // If no segments specified a relevant prefetch config,
      // we fall back to the global config.
      return globalConfig ?? false
    case PartialPrefetchingLevel.Partial:
      return true
    case PartialPrefetchingLevel.Eager:
      return 'unstable_eager'
  }
}

const resolvedLevelCache = new WeakMap<LoaderTree, PartialPrefetchingLevel>()

async function resolvePartialPrefetchingLevelFromSegments(tree: LoaderTree) {
  let result = resolvedLevelCache.get(tree)
  if (result === undefined) {
    result = await resolvePartialPrefetchingLevelFromSegmentsImpl(tree)
    resolvedLevelCache.set(tree, result)
  }
  return result
}

async function resolvePartialPrefetchingLevelFromSegmentsImpl(
  tree: LoaderTree
): Promise<PartialPrefetchingLevel> {
  const { mod: layoutOrPageMod } = await getLayoutOrPageModule(tree)

  const prefetchConfig = getPrefetchConfigFromSegment(layoutOrPageMod)
  let level = configToLevel(prefetchConfig)

  // We're picking the max value, and this is the highest, so we can exit early.
  if (level === PartialPrefetchingLevel.Eager) {
    return level
  }

  const { parallelRoutes } = parseLoaderTree(tree)
  for (const parallelRouteKey in parallelRoutes) {
    const parallelRoute = parallelRoutes[parallelRouteKey]
    const childValue =
      await resolvePartialPrefetchingLevelFromSegmentsImpl(parallelRoute)
    // We're picking the max value, and this is the highest, so we can exit early.
    level = moreSpecificLevel(level, childValue)
    if (level === PartialPrefetchingLevel.Eager) {
      return level
    }
  }

  return level
}

enum PartialPrefetchingLevel {
  Unspecified = 1,
  Partial = 2,
  Eager = 3,
}

function configToLevel(prefetchConfig: Prefetch): PartialPrefetchingLevel {
  switch (prefetchConfig) {
    case 'auto':
    case 'force-disabled':
      return PartialPrefetchingLevel.Unspecified
    case 'partial':
      return PartialPrefetchingLevel.Partial
    case 'unstable_eager':
      return PartialPrefetchingLevel.Eager
  }
}

function moreSpecificLevel(
  left: PartialPrefetchingLevel,
  right: PartialPrefetchingLevel
): PartialPrefetchingLevel {
  return Math.max(left, right)
}

function getPrefetchConfigFromSegment(
  layoutOrPageMod: Record<string, any> | undefined
): Prefetch {
  return (layoutOrPageMod as AppSegmentConfig | undefined)?.prefetch ?? 'auto'
}
