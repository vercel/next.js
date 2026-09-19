import { FetchStrategy } from './types'
import type {
  NormalizedPathname,
  NormalizedSearch,
  NormalizedNextUrl,
} from './cache-key'
import type { RouteTree } from './cache'
import { Fallback, type FallbackType } from './cache-map'
import { HEAD_REQUEST_KEY } from '../../../shared/lib/segment-cache/segment-value-encoding'
import {
  readVaryParams,
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
export type VaryPath = {
  /**
   * Identifies which param this vary path node corresponds to. Used by
   * getFulfilledSegmentVaryPath to determine which params to replace with
   * Fallback based on the varyParams set from the server.
   *
   * - For path params: the param name (e.g., 'slug')
   * - For search params: '?'
   * - For non-param nodes (request keys, etc.): null
   */
  id: string | null
  value: string | null | FallbackType
  /**
   * Whether this node corresponds to a root param — a path param at or above
   * the application's root layout. Root params may appear in the App Shell, so
   * the shell vary path keeps their concrete value instead of replacing it with
   * Fallback. See getShellSegmentVaryPath. Only ever true on path param nodes;
   * false for structural and search param nodes.
   *
   * Always a boolean (never undefined) so that every VaryPath node shares a
   * single hidden class, keeping the cache hot paths monomorphic.
   */
  isRootParam: boolean
  parent: VaryPath | null
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
      id: '?'
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

// requestKey -> pathParams
export type LayoutVaryPath = Opaque<
  {
    id: null
    value: string
    isRootParam: false
    parent: PartialSegmentVaryPath | null
  },
  'LayoutVaryPath'
>

// requestKey -> searchParams -> pathParams
export type PageVaryPath = Opaque<
  {
    id: null
    value: string
    isRootParam: false
    parent: {
      id: '?'
      value: NormalizedSearch | FallbackType
      isRootParam: false
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
    id: null,
    value: pathname,
    isRootParam: false,
    parent: {
      id: '?',
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
  const varyPath: VaryPath = {
    id: null,
    value: pathname,
    isRootParam: false,
    parent: {
      id: '?',
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
  parentPath: PartialSegmentVaryPath | null,
  cacheKey: string,
  paramName: string,
  isRootParam: boolean
): PartialSegmentVaryPath {
  const varyPathPart: VaryPath = {
    id: paramName,
    value: cacheKey,
    isRootParam,
    parent: parentPath,
  }
  return varyPathPart as PartialSegmentVaryPath
}

export function finalizeLayoutVaryPath(
  requestKey: string,
  varyPath: PartialSegmentVaryPath | null
): LayoutVaryPath {
  const layoutVaryPath: VaryPath = {
    id: null,
    value: requestKey,
    isRootParam: false,
    parent: varyPath,
  }
  return layoutVaryPath as LayoutVaryPath
}

export function getPartialLayoutVaryPath(
  finalizedVaryPath: LayoutVaryPath
): PartialSegmentVaryPath | null {
  // This is the inverse of finalizeLayoutVaryPath.
  return finalizedVaryPath.parent
}

export function finalizePageVaryPath(
  requestKey: string,
  renderedSearch: NormalizedSearch,
  varyPath: PartialSegmentVaryPath | null
): PageVaryPath {
  // Unlike layouts, a page segment's vary path also includes the search string.
  // requestKey -> searchParams -> pathParams
  const pageVaryPath: VaryPath = {
    id: null,
    value: requestKey,
    isRootParam: false,
    parent: {
      id: '?',
      value: renderedSearch,
      isRootParam: false,
      parent: varyPath,
    },
  }
  return pageVaryPath as PageVaryPath
}

export function getPartialPageVaryPath(
  finalizedVaryPath: PageVaryPath
): PartialSegmentVaryPath | null {
  // This is the inverse of finalizePageVaryPath.
  return finalizedVaryPath.parent.parent
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
    id: null,
    // Append the actual metadata request key to the page request key. Note
    // that we're not using a separate vary path part; it's unnecessary because
    // these are not conceptually separate inputs.
    value: pageRequestKey + HEAD_REQUEST_KEY,
    isRootParam: false,
    parent: {
      id: '?',
      value: renderedSearch,
      isRootParam: false,
      parent: varyPath,
    },
  }
  return pageVaryPath as PageVaryPath
}

export function getSegmentVaryPathForRequest<TData>(
  fetchStrategy: FetchStrategy,
  tree: RouteTree<TData>
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
        id: null,
        value: originalVaryPath.value,
        isRootParam: false,
        parent: {
          id: '?',
          value: Fallback,
          isRootParam: false,
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
    id: null,
    value: originalVaryPath.value,
    isRootParam: false,
    parent: {
      id: '?',
      value: newSearch,
      isRootParam: false,
      parent: searchParamsVaryPath.parent,
    },
  }
  return clonedVaryPath as PageVaryPath
}

export function getPathParamsKey(varyPath: SegmentVaryPath): string {
  // Concatenates the values of the path params a segment varies by, in vary
  // path order, for use in a React key. The search params entry of a page's
  // vary path (id '?') is skipped; it's keyed separately.
  let key = ''
  let params: VaryPath | null = varyPath.parent
  while (params !== null) {
    const value = params.value
    if (params.id !== '?' && typeof value === 'string') {
      key += '/' + value
    }
    params = params.parent
  }
  return key
}

export function getRenderedSearchFromVaryPath(
  varyPath: PageVaryPath
): NormalizedSearch | null {
  const searchParams = varyPath.parent.value
  return typeof searchParams === 'string'
    ? (searchParams as NormalizedSearch)
    : null
}

export function didLocalVaryParamsChange(
  currentVaryPath: SegmentVaryPath,
  nextVaryPath: SegmentVaryPath
): boolean {
  // Used while traversing two structurally matching route trees in lockstep.
  // The first entry of a finalized vary path is the request key, not a param:
  //
  //   page:   request key -> search params -> path params ...
  //   layout: request key -> path params ...
  //
  // `parent` points to the previous entry in this linked list, not the parent
  // route segment. Skip the request key to reach the newest param input.
  const currentParams = currentVaryPath.parent
  const nextParams = nextVaryPath.parent
  if (currentParams === null || nextParams === null) {
    // A layout with no path params has no entries after its request key.
    return currentParams !== nextParams
  }
  // Ancestor params have already been compared by the caller's traversal, so
  // only this newest value can differ: search params for a page, or the path
  // param for a dynamic layout. Static layouts inherit their parent's params,
  // so this checks an already-matched ancestor value for those nodes. There is
  // no need to walk the rest of either list.
  return currentParams.value !== nextParams.value
}

export function didPathParamsChange<TCurrent, TNext>(
  currentTree: RouteTree<TCurrent>,
  nextTree: RouteTree<TNext>
): boolean {
  // Used while traversing two structurally matching route trees in lockstep.
  // Unlike didLocalVaryParamsChange, this compares every path param the
  // segment renders under, including inherited ones: the traversal continues
  // below a layout whose param value changed, so an ancestor's value is not
  // guaranteed to match at this point.
  let currentParams: VaryPath | null = currentTree.isPage
    ? getPartialPageVaryPath(currentTree.varyPath)
    : getPartialLayoutVaryPath(currentTree.varyPath)
  let nextParams: VaryPath | null = nextTree.isPage
    ? getPartialPageVaryPath(nextTree.varyPath)
    : getPartialLayoutVaryPath(nextTree.varyPath)
  // Both trees are at the same route position, so the two lists hold the same
  // params in the same order and end together.
  while (currentParams !== null && nextParams !== null) {
    if (currentParams.value !== nextParams.value) {
      return true
    }
    currentParams = currentParams.parent
    nextParams = nextParams.parent
  }
  return false
}

export function didSearchParamsChange(
  currentVaryPath: PageVaryPath,
  nextVaryPath: PageVaryPath
): boolean {
  return (
    getRenderedSearchFromVaryPath(currentVaryPath) !==
    getRenderedSearchFromVaryPath(nextVaryPath)
  )
}

export function didVaryPathChange(
  currentVaryPath: SegmentVaryPath,
  nextVaryPath: SegmentVaryPath
): boolean {
  // Compares two vary paths entry by entry: the request key, then (for a page)
  // the search params, then every path param. The paths are the same kind of
  // segment, so they have the same layout; a request key mismatch is caught at
  // the first entry.
  let current: VaryPath | null = currentVaryPath
  let next: VaryPath | null = nextVaryPath
  while (current !== null && next !== null) {
    if (current.value !== next.value) {
      return true
    }
    current = current.parent
    next = next.parent
  }
  return current !== next
}

export function didReadChangedParam(
  currentVaryPath: SegmentVaryPath,
  nextVaryPath: SegmentVaryPath,
  varyParams: VaryParams | null
): boolean {
  // Whether output rendered under `currentVaryPath` read a param whose value
  // differs under `nextVaryPath`, so it would have to be re-rendered there.
  // `varyParams` is the output's dependency source; null means unknown.
  //
  // Both paths belong to the same kind of segment at the same route position,
  // so they list the same inputs in the same order. Walk them in lockstep and
  // read the dependency set only when a param actually differs — at most once.
  let current: VaryPath | null = currentVaryPath
  let next: VaryPath | null = nextVaryPath
  let total: Set<string> | null = null
  while (current !== null && next !== null) {
    if (current.value !== next.value) {
      const id = current.id
      if (id === null) {
        // The request key: equal at the same route position, and callers
        // compare positions before params.
      } else {
        if (total === null) {
          if (varyParams === null) {
            // No dependency information: assume the output depends on it.
            return true
          }
          total = readVaryParams(varyParams)
          if (total === null) {
            // The render that produced this output hasn't finished reporting
            // (or aborted). Same assumption.
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
  original: VaryPath,
  varyParams: Set<string>
): SegmentVaryPath {
  // Re-keys a segment's vary path based on which params the segment actually
  // depends on. Params that are NOT in the varyParams set are replaced with
  // Fallback, allowing the cache entry to be reused across different values of
  // those params.

  // This is called when a segment is fulfilled with data from the server. The
  // varyParams set comes from the server and indicates which params were
  // accessed during rendering.
  const clone: VaryPath = {
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
  return clone as SegmentVaryPath
}

export function getShellSegmentVaryPath(original: VaryPath): SegmentVaryPath {
  // Re-keys a segment's vary path to identify the "App Shell" entry for this
  // segment position — a reusable loading state that can be served for any
  // concrete navigation to this segment. The shell is rendered with params
  // omitted, with one exception: root params (path params at or above the root
  // layout) may be accessed during the shell render, so the shell varies on
  // them. Accordingly, we keep the concrete value of structural nodes (request
  // keys, etc.) and root param nodes, and replace every other param node (non-
  // root path params and search params) with Fallback.
  const clone: VaryPath = {
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
  return clone as SegmentVaryPath
}
