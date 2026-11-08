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

/**
 * The file name of a route's prerender manifest. The name of no other manifest
 * is a path suffix of it, so a tool that matches manifests by path suffix does
 * not take the complete `prerender-manifest.json` for it.
 */
export const ROUTE_PRERENDER_MANIFEST = 'route-prerender-manifest.json'

export type ResponseCacheOwner = {
  readonly kind: RouteKind
  /** Canonical Pages pathname or full App module name, including groups and slots. */
  readonly sourceRoute: string
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
  }
}

/**
 * The prerender manifest of one route, relative to the build output directory.
 * It holds only that route's entries of the complete prerender manifest, and
 * sits in the directory named after the route's entry file
 * (`server/app/blog/[slug]/page.js` has `server/app/blog/[slug]/page/`), where
 * the route's file trace lists it.
 *
 * @param page the App module name including groups and slots, or the Pages
 * pathname
 */
export function getRoutePrerenderManifestPath(
  kind: RouteKind,
  page: string
): string {
  return kind === RouteKind.PAGES || kind === RouteKind.PAGES_API
    ? `server/pages${normalizePagePath(page)}/${ROUTE_PRERENDER_MANIFEST}`
    : `server/app${page.replace(/%5F/g, '_')}/${ROUTE_PRERENDER_MANIFEST}`
}

/**
 * Prerender metadata already identifies its source route. Compare that source
 * with the selected module before using its metadata, including negative
 * entries and partially specialized fallback shells. Cache storage continues
 * to use the full module identity, including groups and parallel slots.
 */
export function isRouteCacheOwner(
  pathname: string,
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
      : appPathnameNormalizer.normalize(owner.sourceRoute))
  )
}

/**
 * Response keys are opaque to cache handlers. Hash the source route into one
 * fixed-length directory, preserving App groups and slots without expanding
 * Unicode names or repeating the source directory hierarchy on disk. The
 * pathname stays readable and is normalized exactly once before namespacing.
 */
export function getRouteCacheKey(
  pathname: string,
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
  return `/${ROUTE_CACHE_DIRECTORY}/${owner.kind}/${source}/$${normalizePagePath(pathname)}`
}
