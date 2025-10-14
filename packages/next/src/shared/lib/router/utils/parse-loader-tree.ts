import { DEFAULT_SEGMENT_KEY } from '../../segment'
import type { LoaderTree } from '../../../../server/lib/app-dir-module'

export function parseLoaderTree(tree: LoaderTree) {
  const [segment, parallelRoutes, modules] = tree
  const { layout, template } = modules
  let { page } = modules
  // a __DEFAULT__ segment means that this route didn't match any of the
  // segments in the route, so we should use the default page
  page = segment === DEFAULT_SEGMENT_KEY ? modules.defaultPage : page

  const conventionPath = layout?.[1] || template?.[1] || page?.[1]

  return {
    page,
    segment,
    modules,
    /* it can be either layout / template / page */
    conventionPath,
    parallelRoutes,
  }
}
