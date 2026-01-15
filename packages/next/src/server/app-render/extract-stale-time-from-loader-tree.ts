import type { LoaderTree } from '../lib/app-dir-module'
import { getLayoutOrPageModule } from '../lib/app-dir-module'

/**
 * Extracts the staleTime export from a loader tree.
 * Walks the tree to find the page segment and extracts staleTime from page/layout modules.
 * The nested-most value wins (page overrides layout).
 */
export async function extractStaleTimeFromLoaderTree(
  tree: LoaderTree
): Promise<number | undefined> {
  const [, parallelRoutes] = tree

  // Get the layout or page module for this segment
  const { mod: layoutOrPageMod } = await getLayoutOrPageModule(tree)

  // Get staleTime from this segment's layout or page module if present
  let staleTime: number | undefined =
    typeof layoutOrPageMod?.staleTime === 'number'
      ? layoutOrPageMod.staleTime
      : undefined

  // Walk through parallel routes (typically just 'children')
  // The nested-most value wins, so we continue walking even if we found staleTime
  const parallelRouteKeys = Object.keys(parallelRoutes)
  for (const key of parallelRouteKeys) {
    const childTree = parallelRoutes[key]
    const childStaleTime = await extractStaleTimeFromLoaderTree(childTree)

    // Nested-most value wins (page overrides layout)
    if (typeof childStaleTime === 'number') {
      staleTime = childStaleTime
    }
  }

  return staleTime
}
