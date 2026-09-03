import type { VariantCombinationGroups } from '../../server/variants/combinations'
import type { VariantsManifest } from '../../server/variants/manifest'

import { isDynamicRoute } from '../../shared/lib/router/utils/is-dynamic'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { sortPagesObject } from '../../shared/lib/router/utils/sortable-routes'

/**
 * Builds the variants manifest from the groups the build collected per page.
 *
 * A static route is keyed by its pathname, which a proxy can look up directly.
 * A dynamic route carries the source of its route regex instead, and the routes
 * are sorted so that a more specific one is tested first.
 */
export function buildVariantsManifest(
  groupsByPage: ReadonlyMap<string, VariantCombinationGroups>
): VariantsManifest {
  const staticRoutes: Record<string, VariantCombinationGroups> = {}
  const dynamicGroupsByPage: Record<string, VariantCombinationGroups> = {}

  for (const [page, groups] of groupsByPage) {
    if (isDynamicRoute(page)) {
      dynamicGroupsByPage[page] = groups
    } else {
      staticRoutes[page] = groups
    }
  }

  const dynamicRoutes = Object.entries(
    sortPagesObject(dynamicGroupsByPage)
  ).map(([page, groups]) => ({
    regex: getRouteRegex(page).re.source,
    groups,
  }))

  return { version: 1, staticRoutes, dynamicRoutes }
}
