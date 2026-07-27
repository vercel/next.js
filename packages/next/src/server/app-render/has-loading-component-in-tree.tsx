import type { LoaderTree } from '../lib/app-dir-module'

export function hasLoadingComponentInTree(tree: LoaderTree): boolean {
  const [, parallelRoutes, { loading }] = tree

  if (loading) {
    return true
  }

  return Object.values(parallelRoutes).some((parallelRoute) =>
    hasLoadingComponentInTree(parallelRoute)
  ) as boolean
}
