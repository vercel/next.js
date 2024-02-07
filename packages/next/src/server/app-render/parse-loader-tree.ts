import { DEFAULT_SEGMENT_KEY } from '../../shared/lib/segment'
import type { LoaderTree } from '../lib/app-dir-module'

export function parseLoaderTree(tree: LoaderTree) {
  const [segment, parallelRoutes, components] = tree
  const { layout } = components
  let { page } = components
  // a __DEFAULT__ segment means that this route didn't match any of the
  // segments in the route, so we should use the default page
  page = segment === DEFAULT_SEGMENT_KEY ? components.defaultPage : page

  const layoutOrPagePath = layout?.[1] || page?.[1]

  return {
    page,
    segment,
    components,
    layoutOrPagePath,
    parallelRoutes,
  }
}
