import { FetchStrategy } from './types'
import type {
  NormalizedPathname,
  NormalizedSearch,
  NormalizedNextUrl,
} from './cache-key'
import type { RouteTree } from './cache'
import { Fallback, type FallbackType } from './cache-map'
import type { SegmentRequestKey } from '../../../shared/lib/segment-cache/segment-value-encoding'
import {
  readVaryParams,
  SEARCH_PARAMS_VARY_ID,
  type VaryParamId,
  type VaryParams,
} from '../../../shared/lib/segment-cache/vary-params-decoding'

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
export type VaryPathNode = {
  /**
   * Identifies which param this vary path node corresponds to. Used by
   * getFulfilledSegmentVaryPath to determine which params to replace with
   * Fallback based on the varyParams set from the server.
   *
   * - For path params: the param name (e.g., 'slug')
   * - For search params: SEARCH_PARAMS_VARY_ID
   * - For non-param nodes (request keys, etc.): null
   */
  id: VaryParamId | null
  value: string | null | FallbackType
  /**
   * Whether this node corresponds to a root param — a path param at or above
   * the application's root layout. Root params may appear in the App Shell, so
   * the shell vary path keeps their concrete value instead of replacing it with
   * Fallback. See getShellSegmentVaryPath. Only ever true on path param nodes;
   * false for structural and search param nodes.
   *
   * Always a boolean (never undefined) so that every VaryPathNode shares a
   * single hidden class, keeping the cache hot paths monomorphic.
   */
  isRootParam: boolean
  parent: VaryPathNode | null
}

// Because it's so important for vary paths to line up across cache accesses,
// we use opaque type aliases to ensure these are only created within
// this module.

// requestKey -> searchParams -> nextUrl
export type RouteVaryPath = Opaque<
  {
    id: null
    value: NormalizedPathname
    isRootParam: false
    parent: {
      id: typeof SEARCH_PARAMS_VARY_ID
      value: NormalizedSearch
      isRootParam: false
      parent: {
        id: null
        value: NormalizedNextUrl | null | FallbackType
        isRootParam: false
        parent: null
      }
    }
  },
  'RouteVaryPath'
>

// requestKey -> [searchParams] -> pathParams
//
// The first entry is the request key (id: null). It is followed by the search
// params entry (id: SEARCH_PARAMS_VARY_ID) when the segment varies on search
// params, and then by the path params (id: param name), one entry per param,
// nearest first.
export type VaryPath = Opaque<
  {
    id: null
    value: SegmentRequestKey
    isRootParam: false
    parent: VaryPathNode | null
  },
  'VaryPath'
>

// Intermediate type used when building a vary path during a recursive traversal
// of the route tree.
export type PartialVaryPath = Opaque<VaryPathNode, 'PartialVaryPath'>

export function getRouteVaryPath(
  pathname: NormalizedPathname,
  search: NormalizedSearch,
  nextUrl: NormalizedNextUrl | null
): RouteVaryPath {
  // requestKey -> searchParams -> nextUrl
  const varyPath: VaryPathNode = {
    id: null,
    value: pathname,
    isRootParam: false,
    parent: {
      id: SEARCH_PARAMS_VARY_ID,
      value: search,
      isRootParam: false,
      parent: {
        id: null,
        value: nextUrl,
        isRootParam: false,
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
  const varyPath: VaryPathNode = {
    id: null,
    value: pathname,
    isRootParam: false,
    parent: {
      id: SEARCH_PARAMS_VARY_ID,
      value: search,
      isRootParam: false,
      parent: {
        id: null,
        value: couldBeIntercepted ? nextUrl : Fallback,
        isRootParam: false,
        parent: null,
      },
    },
  }
  return varyPath as RouteVaryPath
}

export function appendLayoutVaryPath(
  parentPath: PartialVaryPath | null,
  cacheKey: string,
  paramName: string,
  isRootParam: boolean
): PartialVaryPath {
  const varyPathPart: VaryPathNode = {
    id: paramName,
    value: cacheKey,
    isRootParam,
    parent: parentPath,
  }
  return varyPathPart as PartialVaryPath
}

export function finalizeVaryPath(
  requestKey: SegmentRequestKey,
  // Non-null when the segment varies on search params: the search entry is
  // spliced in between the request key and the path params. Fallback keys an
  // entry that is reusable across all search strings.
  searchParams: NormalizedSearch | FallbackType | null,
  partialVaryPath: PartialVaryPath | null
): VaryPath {
  // requestKey -> [searchParams] -> pathParams
  let parent: VaryPathNode | null = partialVaryPath
  if (searchParams !== null) {
    parent = {
      id: SEARCH_PARAMS_VARY_ID,
      value: searchParams,
      isRootParam: false,
      parent: partialVaryPath,
    }
  }
  const varyPath: VaryPathNode = {
    id: null,
    value: requestKey,
    isRootParam: false,
    parent,
  }
  return varyPath as VaryPath
}

export function getPartialVaryPath(
  finalizedVaryPath: VaryPath
): PartialVaryPath | null {
  // This is the inverse of finalizeVaryPath: strip the request key, and the
  // search params entry if there is one.
  const parent = finalizedVaryPath.parent
  if (parent !== null && parent.id === SEARCH_PARAMS_VARY_ID) {
    return parent.parent as PartialVaryPath | null
  }
  return parent as PartialVaryPath | null
}

export function getSegmentVaryPathForRequest<TData>(
  fetchStrategy: FetchStrategy,
  tree: RouteTree<TData>
): VaryPath {
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

  if (
    fetchStrategy === FetchStrategy.RuntimeShell ||
    fetchStrategy === FetchStrategy.StaticShell
  ) {
    // Both shell strategies produce the App Shell variant of a segment —
    // RuntimeShell via a runtime render with non-root params omitted,
    // StaticShell by truncating a static per-segment response at the shell
    // byte boundary. Either way, the resulting entry is reusable across all
    // concrete values of the non-root params, so we key it at the precomputed
    // shell vary path (every non-root param substituted with Fallback; root
    // params keep their concrete value).
    return tree.shellVaryPath
  }

  // The vary path includes a search params entry only when the segment varies
  // on search params.
  const searchParamsVaryPath = originalVaryPath.parent
  if (
    searchParamsVaryPath !== null &&
    searchParamsVaryPath.id === SEARCH_PARAMS_VARY_ID
  ) {
    // Only a runtime prefetch will include search params in the vary path.
    // Static prefetches never include search params, so they can be reused
    // across all possible search param values.
    const doesVaryOnSearchParams =
      fetchStrategy === FetchStrategy.Full ||
      fetchStrategy === FetchStrategy.PPRRuntime

    if (!doesVaryOnSearchParams) {
      // The response from the the server will not vary on search params.
      // Rebuild the vary path with the search params replaced by Fallback.
      //
      // requestKey -> searchParams -> pathParams
      //               ^ This part gets replaced with Fallback
      return finalizeVaryPath(
        originalVaryPath.value,
        Fallback,
        getPartialVaryPath(originalVaryPath)
      )
    }
  }

  // The request does vary on search params. We don't need to modify anything.
  return originalVaryPath
}

export function cloneVaryPathWithNewSearchParams(
  originalVaryPath: VaryPath,
  newSearch: NormalizedSearch
): VaryPath {
  // requestKey -> searchParams -> pathParams
  //               ^ This part gets replaced with newSearch
  const searchParamsVaryPath = originalVaryPath.parent
  if (
    searchParamsVaryPath === null ||
    searchParamsVaryPath.id !== SEARCH_PARAMS_VARY_ID
  ) {
    // No search params entry; nothing to replace.
    return originalVaryPath
  }
  return finalizeVaryPath(
    originalVaryPath.value,
    newSearch,
    getPartialVaryPath(originalVaryPath)
  )
}

/**
 * Returns the rendered value of the vary path's search params entry when the
 * vary path has one with a concrete value, null otherwise. Only a segment that
 * varies on search params carries the entry; on every other vary path, and on
 * one whose search params entry is Fallback, this is null.
 */
export function getRenderedSearchFromVaryPath(
  varyPath: VaryPath
): NormalizedSearch | null {
  let node: VaryPathNode | null = varyPath
  while (node !== null) {
    if (node.id === SEARCH_PARAMS_VARY_ID) {
      const search = node.value
      if (typeof search === 'string') {
        return search as NormalizedSearch
      }
      return null
    }
    node = node.parent
  }
  return null
}

/**
 * The kind of param change between two vary paths for the same segment. A path
 * param change takes precedence, because path params are part of
 * LayoutRouter's React key: the segment remounts either way.
 */
export const enum ParamsChange {
  None,
  SearchParams,
  PathParam,
}

export function compareParams(
  currentVaryPath: VaryPath,
  nextVaryPath: VaryPath
): ParamsChange {
  // Both vary paths are for the same segment, so they list the same params in
  // the same order. Walk them together. This includes params inherited from
  // parent layouts, since those may have changed, too.
  let current: VaryPathNode | null = currentVaryPath
  let next: VaryPathNode | null = nextVaryPath
  let change = ParamsChange.None
  while (current !== null && next !== null) {
    if (current.value !== next.value) {
      const id = current.id
      if (id === null) {
        // The request key. Callers check that the route structure matches
        // first, so it's always the same.
      } else if (id === SEARCH_PARAMS_VARY_ID) {
        change = ParamsChange.SearchParams
      } else {
        return ParamsChange.PathParam
      }
    }
    current = current.parent
    next = next.parent
  }
  return change
}

export function didReadChangedParam(
  currentVaryPath: VaryPath,
  nextVaryPath: VaryPath,
  varyParams: VaryParams | null
): boolean {
  // Returns true if the output rendered with `currentVaryPath` read a param
  // whose value is different in `nextVaryPath`. `varyParams` is the set of
  // params the output read, or null if we don't know.
  //
  // Same traversal as compareParams. Only read the set if a param changed.
  let current: VaryPathNode | null = currentVaryPath
  let next: VaryPathNode | null = nextVaryPath
  let total: Set<VaryParamId> | null = null
  while (current !== null && next !== null) {
    if (current.value !== next.value) {
      const id = current.id
      if (id === null) {
        // The request key. Callers check that the route structure matches
        // first, so it's always the same.
      } else {
        if (total === null) {
          if (varyParams === null) {
            // We don't know. Assume it read the param.
            return true
          }
          total = readVaryParams(varyParams)
          if (total === null) {
            // The render hasn't finished, or it aborted. Assume it read the
            // param.
            return true
          }
        }
        if (total.has(id)) {
          return true
        }
      }
    }
    current = current.parent
    next = next.parent
  }
  return false
}

export function getFulfilledSegmentVaryPath(
  original: VaryPathNode,
  varyParams: Set<VaryParamId>
): VaryPath {
  // Re-keys a segment's vary path based on which params the segment actually
  // depends on. Params that are NOT in the varyParams set are replaced with
  // Fallback, allowing the cache entry to be reused across different values of
  // those params.

  // This is called when a segment is fulfilled with data from the server. The
  // varyParams set comes from the server and indicates which params were
  // accessed during rendering.
  const clone: VaryPathNode = {
    id: original.id,
    // If the id is null, this node is not a param (e.g., it's a request key).
    // If the id is in the varyParams set, keep the original value.
    // Otherwise, replace with Fallback to make it reusable.
    value:
      original.id === null || varyParams.has(original.id)
        ? original.value
        : Fallback,
    isRootParam: original.isRootParam,
    parent:
      original.parent === null
        ? null
        : getFulfilledSegmentVaryPath(original.parent, varyParams),
  }
  return clone as VaryPath
}

export function getShellSegmentVaryPath(original: VaryPathNode): VaryPath {
  // Re-keys a segment's vary path to identify the "App Shell" entry for this
  // segment position — a reusable loading state that can be served for any
  // concrete navigation to this segment. The shell is rendered with params
  // omitted, with one exception: root params (path params at or above the root
  // layout) may be accessed during the shell render, so the shell varies on
  // them. Accordingly, we keep the concrete value of structural nodes (request
  // keys, etc.) and root param nodes, and replace every other param node (non-
  // root path params and search params) with Fallback.
  const clone: VaryPathNode = {
    id: original.id,
    value:
      original.id === null || original.isRootParam === true
        ? original.value
        : Fallback,
    isRootParam: original.isRootParam,
    parent:
      original.parent === null
        ? null
        : getShellSegmentVaryPath(original.parent),
  }
  return clone as VaryPath
}
