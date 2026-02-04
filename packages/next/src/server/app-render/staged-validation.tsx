import { getLayoutOrPageModule } from '../lib/app-dir-module'
import type { LoaderTree } from '../lib/app-dir-module'
import { parseLoaderTree } from '../../shared/lib/router/utils/parse-loader-tree'
import type { AppSegmentConfig } from '../../build/segment-config/app/app-segment-config'

export async function anySegmentHasRuntimePrefetchEnabled(
  tree: LoaderTree
): Promise<boolean> {
  const { mod: layoutOrPageMod } = await getLayoutOrPageModule(tree)

  // TODO(restart-on-cache-miss): Does this work correctly for client page/layout modules?
  const prefetchConfig = layoutOrPageMod
    ? (layoutOrPageMod as AppSegmentConfig).unstable_prefetch
    : undefined
  /** Whether this segment should use a runtime prefetch instead of a static prefetch. */
  const hasRuntimePrefetch = prefetchConfig?.mode === 'runtime'
  if (hasRuntimePrefetch) {
    return true
  }

  const { parallelRoutes } = parseLoaderTree(tree)
  for (const parallelRouteKey in parallelRoutes) {
    const parallelRoute = parallelRoutes[parallelRouteKey]
    const hasChildRuntimePrefetch =
      await anySegmentHasRuntimePrefetchEnabled(parallelRoute)
    if (hasChildRuntimePrefetch) {
      return true
    }
  }

  return false
}
