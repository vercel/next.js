import { FetchStrategy } from './types'
import type {
  NormalizedPathname,
  NormalizedSearch,
  NormalizedNextUrl,
} from './cache-key'
import type { RouteTree } from './cache'
import { Fallback, type FallbackType } from './cache-map'
import { HEAD_REQUEST_KEY } from '../../../shared/lib/segment-cache/segment-value-encoding'

type Opaque<T, K> = T & { __brand: K }

/**
 * A linked-list of all the params (or other param-like) inputs that a cache
 * entry may vary by. This is used by the CacheMap module to reuse cache entries
 * across different param values. If a param has a value of Fallback, it means
 * the cache entry is reusable for all possible values of that param. See
 * cache-map.ts for details.
 *
 * A segment's vary path is a pure function of a segment's position in a
 * particular route tree and the (post-rewrite) URL that is being queried. More
 * concretely, successive queries of the cache for the same segment always use
 * the same vary path.
 *
 * A route's vary path is simpler: it's comprised of the pathname, search
 * string, and Next-URL header.
 */
export type VaryPath = {
  value: string | null | FallbackType
  parent: VaryPath | null
}

// Because it's so important for vary paths to line up across cache accesses,
// we use opaque type aliases to ensure these are only created within
// this module.

// requestKey -> searchParams -> nextUrl
export type RouteVaryPath = Opaque<
  {
    value: NormalizedPathname
    parent: {
      value: NormalizedSearch
      parent: {
        value: NormalizedNextUrl | null | FallbackType
        parent: null
      }
    }
  },
  'RouteVaryPath'
>

// requestKey -> pathParams
export type LayoutVaryPath = Opaque<
  {
    value: string
    parent: PartialSegmentVaryPath | null
  },
  'LayoutVaryPath'
>

// requestKey -> searchParams -> pathParams
export type PageVaryPath = Opaque<
  {
    value: string
    parent: {
      value: NormalizedSearch | FallbackType
      parent: PartialSegmentVaryPath | null
    }
  },
  'PageVaryPath'
>

export type SegmentVaryPath = LayoutVaryPath | PageVaryPath

// Intermediate type used when building a vary path during a recursive traversal
// of the route tree.
export type PartialSegmentVaryPath = Opaque<VaryPath, 'PartialSegmentVaryPath'>

export function getRouteVaryPath(
  pathname: NormalizedPathname,
  search: NormalizedSearch,
  nextUrl: NormalizedNextUrl | null
): RouteVaryPath {
  // requestKey -> searchParams -> nextUrl
  const varyPath: VaryPath = {
    value: pathname,
    parent: {
      value: search,
      parent: {
        value: nextUrl,
        parent: null,
      },
    },
  }
  return varyPath as RouteVaryPath
}

export function getFulfilledRouteVaryPath(
  pathname: NormalizedPathname,
  search: NormalizedSearch,
  nextUrl: NormalizedNextUrl | null,
  couldBeIntercepted: boolean
): RouteVaryPath {
  // This is called when a route's data is fulfilled. The cache entry will be
  // re-keyed based on which inputs the response varies by.
  // requestKey -> searchParams -> nextUrl
  const varyPath: VaryPath = {
    value: pathname,
    parent: {
      value: search,
      parent: {
        value: couldBeIntercepted ? nextUrl : Fallback,
        parent: null,
      },
    },
  }
  return varyPath as RouteVaryPath
}

export function appendLayoutVaryPath(
  parentPath: PartialSegmentVaryPath | null,
  cacheKey: string
): PartialSegmentVaryPath {
  const varyPathPart: VaryPath = {
    value: cacheKey,
    parent: parentPath,
  }
  return varyPathPart as PartialSegmentVaryPath
}

export function finalizeLayoutVaryPath(
  requestKey: string,
  varyPath: PartialSegmentVaryPath | null
): LayoutVaryPath {
  const layoutVaryPath: VaryPath = {
    value: requestKey,
    parent: varyPath,
  }
  return layoutVaryPath as LayoutVaryPath
}

export function finalizePageVaryPath(
  requestKey: string,
  renderedSearch: NormalizedSearch,
  varyPath: PartialSegmentVaryPath | null
): PageVaryPath {
  // Unlike layouts, a page segment's vary path also includes the search string.
  // requestKey -> searchParams -> pathParams
  const pageVaryPath: VaryPath = {
    value: requestKey,
    parent: {
      value: renderedSearch,
      parent: varyPath,
    },
  }
  return pageVaryPath as PageVaryPath
}

export function finalizeMetadataVaryPath(
  pageRequestKey: string,
  renderedSearch: NormalizedSearch,
  varyPath: PartialSegmentVaryPath | null
): PageVaryPath {
  // The metadata "segment" is not a real segment because it doesn't exist in
  // the normal structure of the route tree, but in terms of caching, it
  // behaves like a page segment because it varies by all the same params as
  // a page.
  //
  // To keep the protocol for querying the server simple, the request key for
  // the metadata does not include any path information. It's unnecessary from
  // the server's perspective, because unlike page segments, there's only one
  // metadata response per URL, i.e. there's no need to distinguish multiple
  // parallel pages.
  //
  // However, this means the metadata request key is insufficient for
  // caching the the metadata in the client cache, because on the client we
  // use the request key to distinguish the metadata entry from all other
  // page's metadata entries.
  //
  // So instead we create a simulated request key based on the page segment.
  // Conceptually this is equivalent to the request key the server would have
  // assigned the metadata segment if it treated it as part of the actual
  // route structure.

  // If there are multiple parallel pages, we use whichever is the first one.
  // This is fine because the only difference between request keys for
  // different parallel pages are things like route groups and parallel
  // route slots. As long as it's always the same one, it doesn't matter.
  const pageVaryPath: VaryPath = {
    // Append the actual metadata request key to the page request key. Note
    // that we're not using a separate vary path part; it's unnecessary because
    // these are not conceptually separate inputs.
    value: pageRequestKey + HEAD_REQUEST_KEY,
    parent: {
      value: renderedSearch,
      parent: varyPath,
    },
  }
  return pageVaryPath as PageVaryPath
}

export function getSegmentVaryPathForRequest(
  fetchStrategy: FetchStrategy,
  tree: RouteTree
): SegmentVaryPath {
  // This is used for storing pending requests in the cache. We want to choose
  // the most generic vary path based on the strategy used to fetch it, i.e.
  // static/PPR versus runtime prefetching, so that it can be reused as much
  // as possible.
  //
  // We may be able to re-key the response to something even more generic once
  // we receive it — for example, if the server tells us that the response
  // doesn't vary on a particular param — but even before we send the request,
  // we know some params are reusable based on the fetch strategy alone. For
  // example, a static prefetch will never vary on search params.
  //
  // The original vary path with all the params filled in is stored on the
  // route tree object. We will clone this one to create a new vary path
  // where certain params are replaced with Fallback.
  //
  // This result of this function is not stored anywhere. It's only used to
  // access the cache a single time.
  //
  // TODO: Rather than create a new list object just to access the cache, the
  // plan is to add the concept of a "vary mask". This will represent all the
  // params that can be treated as Fallback. (Or perhaps the inverse.)
  const originalVaryPath = tree.varyPath

  // Only page segments (and the special "metadata" segment, which is treated
  // like a page segment for the purposes of caching) may contain search
  // params. There's no reason to include them in the vary path otherwise.
  if (tree.isPage) {
    // Only a runtime prefetch will include search params in the vary path.
    // Static prefetches never include search params, so they can be reused
    // across all possible search param values.
    const doesVaryOnSearchParams =
      fetchStrategy === FetchStrategy.Full ||
      fetchStrategy === FetchStrategy.PPRRuntime

    if (!doesVaryOnSearchParams) {
      // The response from the the server will not vary on search params. Clone
      // the end of the original vary path to replace the search params
      // with Fallback.
      //
      // requestKey -> searchParams -> pathParams
      //               ^ This part gets replaced with Fallback
      const searchParamsVaryPath = (originalVaryPath as PageVaryPath).parent
      const pathParamsVaryPath = searchParamsVaryPath.parent
      const patchedVaryPath: VaryPath = {
        value: originalVaryPath.value,
        parent: {
          value: Fallback,
          parent: pathParamsVaryPath,
        },
      }
      return patchedVaryPath as SegmentVaryPath
    }
  }

  // The request does vary on search params. We don't need to modify anything.
  return originalVaryPath as SegmentVaryPath
}

export function clonePageVaryPathWithNewSearchParams(
  originalVaryPath: PageVaryPath,
  newSearch: NormalizedSearch
): PageVaryPath {
  // requestKey -> searchParams -> pathParams
  //               ^ This part gets replaced with newSearch
  const searchParamsVaryPath = originalVaryPath.parent
  const clonedVaryPath: VaryPath = {
    value: originalVaryPath.value,
    parent: {
      value: newSearch,
      parent: searchParamsVaryPath.parent,
    },
  }
  return clonedVaryPath as PageVaryPath
}
