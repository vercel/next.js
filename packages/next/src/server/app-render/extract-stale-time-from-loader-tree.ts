import type { LoaderTree } from '../lib/app-dir-module'
import { getLayoutOrPageModule } from '../lib/app-dir-module'

/**
 * Extracts the unstable_staleTime export from a loader tree.
 * Walks the tree to find the page segment and extracts unstable_staleTime.
 * Only page modules are checked - layouts do not support unstable_staleTime.
 */
export async function extractStaleTimeFromLoaderTree(
  tree: LoaderTree
): Promise<number | undefined> {
  const [, parallelRoutes] = tree

  // Get the layout or page module for this segment
  const { mod, modType } = await getLayoutOrPageModule(tree)

  // Get unstable_staleTime only from page modules (not layouts)
  let staleTime: number | undefined =
    modType === 'page' && typeof mod?.unstable_staleTime === 'number'
      ? mod.unstable_staleTime
      : undefined

  // Walk through parallel routes (typically just 'children')
  const parallelRouteKeys = Object.keys(parallelRoutes)
  for (const key of parallelRouteKeys) {
    const childTree = parallelRoutes[key]
    const childStaleTime = await extractStaleTimeFromLoaderTree(childTree)

    if (typeof childStaleTime === 'number') {
      staleTime = childStaleTime
    }
  }

  return staleTime
}
