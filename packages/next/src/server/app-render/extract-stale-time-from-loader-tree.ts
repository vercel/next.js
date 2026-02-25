import type { LoaderTree } from '../lib/app-dir-module'
import { getLayoutOrPageModule } from '../lib/app-dir-module'

type StaleTimeConfig = { dynamic?: number; static?: number }

/**
 * Extracts the unstable_staleTime export from a loader tree.
 * Walks the tree to find the page segment and extracts unstable_staleTime.
 * Only page modules are checked - layouts do not support unstable_staleTime.
 */
export async function extractStaleTimeFromLoaderTree(
  tree: LoaderTree
): Promise<StaleTimeConfig | undefined> {
  const [, parallelRoutes] = tree

  // Get the layout or page module for this segment
  const { mod, modType } = await getLayoutOrPageModule(tree)

  // Get unstable_staleTime only from page modules (not layouts)
  let staleTime: StaleTimeConfig | undefined =
    modType === 'page' && mod?.unstable_staleTime != null
      ? mod.unstable_staleTime
      : undefined

  // Walk through parallel routes (typically just 'children')
  const parallelRouteKeys = Object.keys(parallelRoutes)
  for (const key of parallelRouteKeys) {
    const childTree = parallelRoutes[key]
    const childStaleTime = await extractStaleTimeFromLoaderTree(childTree)

    if (childStaleTime != null) {
      staleTime = childStaleTime
    }
  }

  return staleTime
}
