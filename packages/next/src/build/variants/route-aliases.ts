import type { DynamicManifestRoute } from '../utils'

import {
  NEXT_VARIANTS_QUERY_PARAM,
  VARIANTS_PATH_PREFIX,
} from '../../lib/constants'
import { normalizeRouteRegex } from '../../lib/load-custom-routes'
import { getNamedRouteRegex } from '../../shared/lib/router/utils/route-regex'

/**
 * Resolves a variant-prefixed artifact pathname to its unprefixed page.
 *
 * A deployment may invoke the route's function to fill or revalidate a
 * prerender. It can construct that request from the artifact pathname without
 * repeating external routing. The prefix remains when the deployment handler
 * resolves which page module to load.
 *
 * `page` stays unprefixed and names the module. The regexes carry the prefix,
 * and the named regex captures the hash as `nxtV`. One alias matches every hash
 * for a page.
 */
export function buildVariantRouteAliases(
  pages: Iterable<string>
): DynamicManifestRoute[] {
  const aliases: DynamicManifestRoute[] = []

  for (const page of pages) {
    const routeRegex = getNamedRouteRegex(page, { prefixRouteKeys: true })

    aliases.push({
      page,
      sourcePage: undefined,
      regex: normalizeRouteRegex(
        routeRegex.re.source.replace('^', `^/${VARIANTS_PATH_PREFIX}/[^/]+`)
      ),
      routeKeys: routeRegex.routeKeys,
      namedRegex: routeRegex.namedRegex.replace(
        '^',
        `^/${VARIANTS_PATH_PREFIX}/(?<${NEXT_VARIANTS_QUERY_PARAM}>[^/]+)`
      ),
      skipInternalRouting: true,
      variantsPrefixed: true,
    })
  }

  return aliases
}
