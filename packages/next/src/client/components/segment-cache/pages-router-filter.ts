import { BloomFilter } from '../../../shared/lib/bloom-filter'
import { removeTrailingSlash } from '../../../shared/lib/router/utils/remove-trailing-slash'
import { removeBasePath } from '../../remove-base-path'
import { hasBasePath } from '../../has-base-path'

/**
 * Bloom filters of Pages Router routes, injected at build time (see
 * `pagesRouterFilters` in define-env). These are the mirror image of the
 * `__NEXT_CLIENT_ROUTER_S_FILTER`/`D_FILTER` filters that the Pages Router
 * runtime uses to detect App Router destinations.
 *
 * The optimistic route matcher fabricates route trees for URLs that match a
 * learned App Router pattern without consulting the server. That is only
 * sound if the App Router actually owns the URL. The Pages Router can own
 * URLs that fit an App Router pattern — most notably a page at the same
 * specificity as an optional catch-all (`pages/docs.tsx` alongside
 * `app/docs/[[...slug]]/page.tsx`, where `/docs` belongs to the Pages Router
 * but matches the catch-all with zero segments), and static pages shadowing
 * catch-all or dynamic params (`pages/docs/intro.tsx` shadowing
 * `/docs/[[...slug]]`). Within the App Router these conflicts are rejected at
 * build time or covered by `staticSiblings`, but routes in the Pages Router
 * are invisible to the route tree, so we check these filters before
 * predicting.
 *
 * A false positive merely skips the prediction and falls back to server
 * resolution — correct, just less optimized — so the filters' small error
 * rate is safe by construction.
 */

type FilterData = ReturnType<BloomFilter['export']> | false

type PagesRouterFilters = {
  staticFilter: BloomFilter | null
  dynamicFilter: BloomFilter | null
}

let filters: PagesRouterFilters | null = null

function getFilters(): PagesRouterFilters {
  if (filters !== null) {
    return filters
  }

  const staticFilterData: FilterData = process.env
    .__NEXT_PAGES_ROUTER_S_FILTER as any
  const dynamicFilterData: FilterData = process.env
    .__NEXT_PAGES_ROUTER_D_FILTER as any

  let staticFilter: BloomFilter | null = null
  if (staticFilterData && staticFilterData.numHashes) {
    staticFilter = new BloomFilter(
      staticFilterData.numItems,
      staticFilterData.errorRate
    )
    staticFilter.import(staticFilterData)
  }

  let dynamicFilter: BloomFilter | null = null
  if (dynamicFilterData && dynamicFilterData.numHashes) {
    dynamicFilter = new BloomFilter(
      dynamicFilterData.numItems,
      dynamicFilterData.errorRate
    )
    dynamicFilter.import(dynamicFilterData)
  }

  filters = { staticFilter, dynamicFilter }
  return filters
}

/**
 * Returns true if the given pathname may be owned by the Pages Router, in
 * which case the App Router must not predict a route for it client-side.
 *
 * Mirrors the matching performed by the Pages Router's `_bfl` check: the
 * static filter holds exact route paths, and the dynamic filter holds the
 * static prefixes of dynamic routes (`/docs` for `pages/docs/[id].tsx`), so
 * any prefix hit means a dynamic Pages route may match the URL.
 *
 * (Pages routes that begin with a dynamic segment are stored as normalized
 * `[]` patterns, which require knowing the matched route shape to check; the
 * optimistic matcher checks before matching, so those are not consulted here.
 * Such routes would shadow every URL shape, which in practice does not occur
 * alongside App Router patterns.)
 */
export function mayBelongToPagesRouter(pathname: string): boolean {
  const { staticFilter, dynamicFilter } = getFilters()
  if (staticFilter === null && dynamicFilter === null) {
    return false
  }

  let normalized = removeTrailingSlash(pathname)
  if (hasBasePath(normalized)) {
    normalized = removeTrailingSlash(removeBasePath(normalized))
  }

  if (staticFilter !== null && staticFilter.contains(normalized)) {
    return true
  }

  if (dynamicFilter !== null) {
    // If any sub-path of the pathname matches a dynamic filter entry, a
    // dynamic Pages route anchored at that prefix may own the URL.
    const parts = normalized.split('/')
    for (let i = 1; i < parts.length + 1; i++) {
      const prefix = parts.slice(0, i).join('/')
      if (prefix !== '' && dynamicFilter.contains(prefix)) {
        return true
      }
    }
  }

  return false
}
