import type { Page, Route } from '../../shared/lib/route-types'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type {
  DynamicPrerenderManifestRoute,
  PrerenderManifestRoute,
} from '../../build'
import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'
import { normalizeLocalePath } from '../../shared/lib/i18n/normalize-locale-path'
import { InvariantError } from '../../shared/lib/invariant-error'
import { AppPathnameNormalizer } from '../normalizers/built/app/app-pathname-normalizer'
import { RouteKind } from '../route-kind'

export const ROUTE_CACHE_DIRECTORY = 'route-cache'

export type ResponseCacheOwner =
  | {
      readonly kind: RouteKind.PAGES
      /** Canonical Pages URL pathname, not its possibly /index-suffixed module. */
      readonly sourceRoute: Route
    }
  | {
      readonly kind: Exclude<RouteKind, RouteKind.PAGES>
      /** Full module name, preserving App groups, slots and leaf suffixes. */
      readonly sourceRoute: Page
    }

const appPathnameNormalizer = new AppPathnameNormalizer()

/** Convert a runtime route definition to the identity used by response caches. */
export function getResponseCacheOwner(
  definition: Pick<RouteDefinition, 'kind' | 'page' | 'pathname'>
): ResponseCacheOwner {
  return {
    kind: definition.kind,
    // Pages module names can include a trailing /index in Turbopack. Their
    // pathname matches the manifest's source in both bundlers. App modules
    // retain groups and parallel slots in their cache identity.
    sourceRoute:
      definition.kind === RouteKind.PAGES
        ? definition.pathname
        : definition.page,
  } as ResponseCacheOwner // The existing kind-dependent selection establishes the correlation.
}

/**
 * Prerender metadata already identifies its source route. Compare that source
 * with the selected module before using its metadata, including negative
 * entries and partially specialized fallback shells. Cache storage continues
 * to use the full module identity, including groups and parallel slots.
 */
export function isRouteCacheOwner(
  pathname: Route,
  owner: ResponseCacheOwner,
  prerender:
    | Pick<PrerenderManifestRoute, 'srcRoute' | 'dataRoute'>
    | Pick<DynamicPrerenderManifestRoute, 'fallbackSourceRoute' | 'dataRoute'>
    | undefined,
  locales?: readonly string[]
): boolean {
  if (!prerender) {
    return false
  }

  // Pages have JSON data routes, App Pages have RSC data routes, and App
  // Route Handlers have no separate data route.
  const kind =
    prerender.dataRoute === null
      ? RouteKind.APP_ROUTE
      : prerender.dataRoute.endsWith('.json')
        ? RouteKind.PAGES
        : prerender.dataRoute.endsWith('.rsc')
          ? RouteKind.APP_PAGE
          : undefined
  if (kind !== owner.kind) {
    return false
  }

  const source =
    'srcRoute' in prerender ? prerender.srcRoute : prerender.fallbackSourceRoute
  const prerenderOwner =
    source ??
    (kind === RouteKind.PAGES
      ? normalizeLocalePath(pathname, locales).pathname
      : pathname)

  return (
    prerenderOwner ===
    (kind === RouteKind.PAGES
      ? owner.sourceRoute
      : // The earlier kind equality check proves this is an App module;
        // TypeScript does not retain that correlation through `kind`.
        appPathnameNormalizer.normalize(owner.sourceRoute as Page))
  )
}

/**
 * Response keys are opaque to cache handlers. Hash the source route into one
 * fixed-length directory, preserving App groups and slots without expanding
 * Unicode names or repeating the source directory hierarchy on disk. The
 * pathname stays readable and is normalized exactly once before namespacing.
 */
export function getRouteCacheKey(
  pathname: Route,
  owner: ResponseCacheOwner
): string {
  if (!owner) {
    throw new InvariantError('Response cache requires a source route')
  }
  const { sourceRoute } = owner
  let source: string
  if (process.env.NEXT_RUNTIME === 'edge') {
    const sha256 =
      require('next/dist/compiled/hash.js/sha256') as typeof import('next/dist/compiled/hash.js/sha256')
    source = sha256()
      .update(new TextEncoder().encode(sourceRoute))
      .digest('hex')
  } else {
    const { createHash } = require('crypto') as typeof import('crypto')
    source = createHash('sha256').update(sourceRoute).digest('hex')
  }
  // @ts-ignore Human review: response URL Route is passed to the Page-only file codec; preserve existing cache-key encoding rather than converting representations.
  return `/${ROUTE_CACHE_DIRECTORY}/${owner.kind}/${source}/$${normalizePagePath(pathname)}`
}
