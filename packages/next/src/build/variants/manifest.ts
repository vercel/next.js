import type { VariantCombinationGroups } from '../../server/variants/combinations'
import type { VariantsManifest } from '../../server/variants/manifest'

import { hashVariants } from '../../server/variants/encoding'
import { isDynamicRoute } from '../../shared/lib/router/utils/is-dynamic'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { sortPagesObject } from '../../shared/lib/router/utils/sortable-routes'

export function recordVariantOutput(
  outputHashesByPage: Map<string, Set<string>>,
  page: string,
  variantValues: Readonly<Record<string, string>> | undefined
): void {
  if (!variantValues) {
    return
  }

  let outputHashes = outputHashesByPage.get(page)

  if (!outputHashes) {
    outputHashes = new Set()
    outputHashesByPage.set(page, outputHashes)
  }

  outputHashes.add(hashVariants(variantValues))
}

/**
 * Builds the variant groups consumed by the origin and their proxy projection.
 *
 * Only combinations that produced an output reach the origin. Output
 * availability belongs to the page rather than to one params row: a combination
 * applies to the whole route, so one concrete output establishes that the same
 * combination can partition an on-demand prerender for another param.
 *
 * The proxy projection keeps a page with empty groups when none of its
 * combinations produced an output. It then blocks a less specific dynamic route
 * from supplying combinations that belong to another page.
 */
export function buildVariantsManifest(
  groupsByPage: ReadonlyMap<string, VariantCombinationGroups>,
  outputHashesByPage: ReadonlyMap<string, ReadonlySet<string>>
): {
  variantCombinationGroups: Record<string, VariantCombinationGroups>
  variantsManifest: VariantsManifest
} {
  const variantCombinationGroups: Record<string, VariantCombinationGroups> = {}
  const staticRoutes: Record<string, VariantCombinationGroups> = {}
  const dynamicGroupsByPage: Record<string, VariantCombinationGroups> = {}

  for (const [page, groups] of groupsByPage) {
    const outputHashes = outputHashesByPage.get(page)
    const filteredGroups: VariantCombinationGroups = []

    if (outputHashes) {
      for (const group of groups) {
        const combinations = group.combinations.filter((combination) =>
          outputHashes.has(combination.hash)
        )

        if (combinations.length > 0) {
          filteredGroups.push({ ...group, combinations })
        }
      }
    }

    if (filteredGroups.length > 0) {
      variantCombinationGroups[page] = filteredGroups
    }

    if (isDynamicRoute(page)) {
      dynamicGroupsByPage[page] = filteredGroups
    } else {
      staticRoutes[page] = filteredGroups
    }
  }

  const dynamicRoutes = Object.entries(
    sortPagesObject(dynamicGroupsByPage)
  ).map(([page, groups]) => ({
    regex: getRouteRegex(page).re.source,
    groups,
  }))

  return {
    variantCombinationGroups,
    variantsManifest: { version: 1, staticRoutes, dynamicRoutes },
  }
}
