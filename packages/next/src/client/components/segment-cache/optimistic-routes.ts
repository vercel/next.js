/**
 * Optimistic Routing (Known Routes)
 *
 * This module enables the client to predict route structure for URLs that
 * haven't been prefetched yet, based on previously learned route patterns.
 * When successful, this allows skipping the route tree prefetch request
 * entirely.
 *
 * The core idea is that many URLs map to the same route structure. For example,
 * /blog/post-1 and /blog/post-2 both resolve to /blog/[slug]. Once we've
 * prefetched one, we can predict the structure of the other.
 *
 * However, we can't always make this prediction. Static siblings (like
 * /blog/featured alongside /blog/[slug]) have different route structures.
 * When we learn a dynamic route, we also learn its static siblings so we
 * know when NOT to apply the prediction.
 *
 * Main entry points:
 *
 * 1. discoverKnownRoute: Called after receiving a route tree from the server.
 *    Traverses the route tree, compares URL parts to segments, and populates
 *    the known route tree if they match. Routes are always inserted into the
 *    cache.
 *
 * 2. matchKnownRoute: Called when looking up a route with no cache entry.
 *    Matches the candidate URL against learned patterns. Returns a synthetic
 *    cache entry if successful, or null to fall back to server resolution.
 *
 * Rewrite detection happens during traversal: if a URL path part doesn't match
 * the corresponding route segment, we stop populating the known route tree
 * (since the mapping is incorrect) but still insert the route into the cache.
 *
 * The known route tree is append-only with no eviction. Route patterns are
 * derived from the filesystem, so they don't become stale within a session.
 * Cache invalidation on deploy clears everything anyway.
 *
 * Current limitations (deopt to server resolution):
 * - Rewrites: Detected during traversal (tree not populated, but route cached)
 * - Intercepted routes: Routes using (.), (..), (...) patterns
 */

import type { DynamicParamTypesShort } from '../../../shared/lib/app-router-types'
import type { RouteTree, FulfilledRouteCacheEntry } from './cache'
import {
  EntryStatus,
  writeRouteIntoCache,
  fulfillRouteCacheEntry,
  type PendingRouteCacheEntry,
  createMetadataRouteTree,
} from './cache'
import { doesStaticSegmentAppearInURL } from '../../route-params'
import type { NormalizedPathname, NormalizedSearch } from './cache-key'
import {
  appendLayoutVaryPath,
  finalizeLayoutVaryPath,
  finalizePageVaryPath,
  finalizeMetadataVaryPath,
  type PartialSegmentVaryPath,
  type PageVaryPath,
} from './vary-path'

/**
 * The known route tree is analogous to a route table. A different routing
 * implementation might use regexes or URLPattern; ours uses a trie indexed
 * by URL path segments.
 *
 * Each node (KnownRoutePart) represents a position in the URL and can have:
 * - staticChildren: Map of literal segments to child nodes
 * - dynamicChild: A single dynamic segment node ([slug], [...params], etc.)
 * - pattern: A cache entry template for routes that terminate here
 *
 * This tree only contains segments that correspond to actual filesystem routes.
 * Route groups like (marketing) and parallel routes like @modal are not
 * included since they don't appear in URLs. Similarly, if a URL is rewritten
 * to a different filesystem path, the original URL segments don't appear here
 * — only the resolved filesystem route structure is stored.
 *
 * Example tree after learning /blog/[slug], /blog/featured, and /about:
 *
 *   ├── about
 *   └── blog
 *       ├── featured
 *       └── [slug]
 *
 * When matching /blog/hello:
 *   1. "blog" matches static child
 *   2. "hello" doesn't match "featured", falls through to [slug]
 *   3. Returns [slug]'s pattern with resolved param { slug: "hello" }
 */
type KnownRoutePartBase = {
  // Known static paths at this level. The null vs Map distinction is
  // semantically meaningful:
  // - null: Static siblings are UNKNOWN at this level (e.g., webpack dev mode
  //   where routes are compiled on-demand). If there's a dynamicChild, we
  //   can't safely match it because the URL might be an unknown static sibling.
  // - Map (even if empty): Static siblings are KNOWN. We can safely match a
  //   dynamicChild if the URL doesn't match any entry in the Map.
  staticChildren: Map<string, KnownRoutePart> | null

  // The cache entry that serves as a pattern for this route.
  // When a URL matches, we clone this and substitute param values.
  // null means we know this path exists (from static siblings) but haven't
  // learned its structure yet.
  pattern: FulfilledRouteCacheEntry | null

  // TODO: For prefix rewrite support. When true, this part may not appear in
  // the candidate URL because it was injected by a rewrite.
  // mayBeSkippedInURL: boolean
}

// The dynamic child fields are structured as a union so that narrowing on
// dynamicChild also narrows dynamicChildParamName and dynamicChildParamType.
type KnownRoutePartWithoutDynamicChild = KnownRoutePartBase & {
  dynamicChild: null
  dynamicChildParamName: null
  dynamicChildParamType: null
}

type KnownRoutePartWithDynamicChild = KnownRoutePartBase & {
  dynamicChild: KnownRoutePart
  dynamicChildParamName: string
  dynamicChildParamType: DynamicParamTypesShort
}

type KnownRoutePart =
  | KnownRoutePartWithoutDynamicChild
  | KnownRoutePartWithDynamicChild

/**
 * Param values extracted during URL matching. Used to reify the template.
 * - string for regular dynamic [param]
 * - string[] for catch-all [...param] and optional catch-all [[...param]]
 */
type ResolvedParams = Map<string, string | string[]>

function createEmptyPart(): KnownRoutePart {
  return {
    staticChildren: null,
    dynamicChild: null,
    dynamicChildParamName: null,
    dynamicChildParamType: null,
    pattern: null,
  }
}

// The root of the known route tree.
let knownRouteTreeRoot: KnownRoutePart = createEmptyPart()

/**
 * Learns a route pattern from a server response and inserts it into the cache.
 *
 * Called after receiving a route tree from the server (initial load, navigation,
 * or prefetch). Traverses the route tree, compares URL parts to segments, and
 * populates the known route tree if they match. Routes are always inserted into
 * the cache regardless of whether the URL matches the route structure.
 *
 * When pendingEntry is provided, it's fulfilled and used. When null, an entry
 * is created and inserted into the route cache map.
 *
 * When hasDynamicRewrite is true, the route entry is marked as having a
 * dynamic rewrite, which prevents it from being used as a template for future
 * predictions. This is set when we detect a mismatch between what we predicted
 * and what the server returned.
 *
 * Returns the fulfilled route cache entry.
 */
export function discoverKnownRoute(
  now: number,
  pathname: string,
  pendingEntry: PendingRouteCacheEntry | null,
  routeTree: RouteTree,
  metadataVaryPath: PageVaryPath,
  couldBeIntercepted: boolean,
  canonicalUrl: string,
  isPPREnabled: boolean,
  hasDynamicRewrite: boolean
): FulfilledRouteCacheEntry {
  const tree = routeTree

  const pathnameParts = pathname.split('/').filter((p) => p !== '')
  const firstPart = pathnameParts.length > 0 ? pathnameParts[0] : null
  const remainingParts = pathnameParts.length > 0 ? pathnameParts.slice(1) : []

  if (pendingEntry !== null) {
    // Fulfill the pending entry first
    const fulfilledEntry = fulfillRouteCacheEntry(
      now,
      pendingEntry,
      tree,
      metadataVaryPath,
      couldBeIntercepted,
      canonicalUrl,
      isPPREnabled
    )
    if (hasDynamicRewrite) {
      fulfilledEntry.hasDynamicRewrite = true
    }
    // Populate the known route tree (handles rewrite detection internally).
    // The entry is already in the cache; this just stores it as a pattern
    // if the URL matches the route structure.
    discoverKnownRoutePart(
      knownRouteTreeRoot,
      tree,
      firstPart,
      remainingParts,
      fulfilledEntry,
      now,
      pathname,
      tree,
      metadataVaryPath,
      couldBeIntercepted,
      canonicalUrl,
      isPPREnabled,
      hasDynamicRewrite
    )
    return fulfilledEntry
  }

  // No pending entry - discoverKnownRoutePart will create one and insert it
  // into the cache, or return an existing pattern if one exists.
  return discoverKnownRoutePart(
    knownRouteTreeRoot,
    tree,
    firstPart,
    remainingParts,
    null,
    now,
    pathname,
    tree,
    metadataVaryPath,
    couldBeIntercepted,
    canonicalUrl,
    isPPREnabled,
    hasDynamicRewrite
  )
}

/**
 * Gets or creates the dynamic child node for a KnownRoutePart.
 * A node can have at most one dynamic child (you can't have both [slug] and
 * [id] at the same route level), so we either return existing or create new.
 */
function discoverDynamicChild(
  part: KnownRoutePart,
  paramName: string,
  paramType: DynamicParamTypesShort
): KnownRoutePart {
  if (part.dynamicChild !== null) {
    return part.dynamicChild
  }
  const newChild = createEmptyPart()
  // Type assertion needed because we're converting from "without" to "with"
  // dynamic child variant.
  const mutablePart = part as unknown as KnownRoutePartWithDynamicChild
  mutablePart.dynamicChild = newChild
  mutablePart.dynamicChildParamName = paramName
  mutablePart.dynamicChildParamType = paramType
  return newChild
}

/**
 * Recursive workhorse for discoverKnownRoute.
 *
 * Walks the route tree and URL parts in parallel, building out the known
 * route tree as it goes. At each step:
 * 1. Determines if the current segment appears in the URL (dynamic/static)
 * 2. Validates URL matches route structure (detects rewrites)
 * 3. Creates/updates the corresponding KnownRoutePart node
 * 4. Records static siblings for future matching
 * 5. Recurses into child slots (parallel routes)
 *
 * If a URL/route mismatch is detected (rewrite), we stop building the known
 * route tree but still cache the route entry for direct lookup.
 */
function discoverKnownRoutePart(
  parentKnownRoutePart: KnownRoutePart,
  routeTree: RouteTree,
  urlPart: string | null,
  remainingParts: string[],
  existingEntry: FulfilledRouteCacheEntry | null,
  // These are passed through unchanged for entry creation at the leaf
  now: number,
  pathname: string,
  fullTree: RouteTree,
  metadataVaryPath: PageVaryPath,
  couldBeIntercepted: boolean,
  canonicalUrl: string,
  isPPREnabled: boolean,
  hasDynamicRewrite: boolean
): FulfilledRouteCacheEntry {
  const segment = routeTree.segment

  let segmentAppearsInURL: boolean
  let paramName: string | null = null
  let paramType: DynamicParamTypesShort | null = null
  let staticSiblings: readonly string[] | null = null

  if (typeof segment === 'string') {
    segmentAppearsInURL = doesStaticSegmentAppearInURL(segment)
  } else {
    // Dynamic segment tuple: [paramName, paramCacheKey, paramType, staticSiblings]
    paramName = segment[0]
    paramType = segment[2]
    staticSiblings = segment[3]
    segmentAppearsInURL = true
  }

  let knownRoutePart: KnownRoutePart = parentKnownRoutePart
  let nextUrlPart: string | null = urlPart
  let nextRemainingParts: string[] = remainingParts

  if (segmentAppearsInURL) {
    // Check for mismatch: if this is a static segment, the URL part must match
    if (paramName === null && urlPart !== segment) {
      // URL doesn't match route structure (likely a rewrite).
      // Don't populate the known route tree, just write the route into the
      // cache and return immediately.
      if (existingEntry !== null) {
        return existingEntry
      }
      return writeRouteIntoCache(
        now,
        pathname as NormalizedPathname,
        fullTree,
        metadataVaryPath,
        couldBeIntercepted,
        canonicalUrl,
        isPPREnabled
      )
    }

    // URL matches route structure. Build the known route tree.
    if (paramName !== null && paramType !== null) {
      // Dynamic segment
      knownRoutePart = discoverDynamicChild(
        parentKnownRoutePart,
        paramName,
        paramType
      )

      // Record static siblings as placeholder parts.
      // IMPORTANT: We use the null vs Map distinction to track whether
      // siblings are known at this level:
      // - staticChildren: null = siblings unknown (can't safely match dynamic)
      // - staticChildren: Map = siblings known (even if empty)
      // This matters in dev mode where webpack may not know all siblings yet.
      if (staticSiblings !== null) {
        // Siblings are known - ensure we have a Map (even if empty)
        if (parentKnownRoutePart.staticChildren === null) {
          parentKnownRoutePart.staticChildren = new Map()
        }
        for (const sibling of staticSiblings) {
          if (!parentKnownRoutePart.staticChildren.has(sibling)) {
            parentKnownRoutePart.staticChildren.set(sibling, createEmptyPart())
          }
        }
      }
    } else {
      // Static segment
      if (parentKnownRoutePart.staticChildren === null) {
        parentKnownRoutePart.staticChildren = new Map()
      }
      let existingChild = parentKnownRoutePart.staticChildren.get(urlPart!)
      if (existingChild === undefined) {
        existingChild = createEmptyPart()
        parentKnownRoutePart.staticChildren.set(urlPart!, existingChild)
      }
      knownRoutePart = existingChild
    }

    // Advance to next URL part
    nextUrlPart = remainingParts.length > 0 ? remainingParts[0] : null
    nextRemainingParts =
      remainingParts.length > 0 ? remainingParts.slice(1) : []
  }
  // else: Transparent segment (route group, __PAGE__, etc.)
  // Stay at the same known route part, don't advance URL parts

  // Recurse into child routes. A route tree can have multiple parallel routes
  // (e.g., @modal alongside children). Each parallel route is a separate
  // branch, but they all share the same URL - we just need to traverse all
  // branches to build out the known route tree.
  const slots = routeTree.slots
  let resultFromChildren: FulfilledRouteCacheEntry | null = null
  if (slots !== null) {
    for (const parallelRouteKey in slots) {
      const childRouteTree = slots[parallelRouteKey]
      // Skip branches with refreshState set - these were reused from a
      // different route (e.g., a "default" parallel slot) and don't represent
      // the actual route structure for this URL.
      if (childRouteTree.refreshState !== null) {
        continue
      }
      const result = discoverKnownRoutePart(
        knownRoutePart,
        childRouteTree,
        nextUrlPart,
        nextRemainingParts,
        existingEntry,
        now,
        pathname,
        fullTree,
        metadataVaryPath,
        couldBeIntercepted,
        canonicalUrl,
        isPPREnabled,
        hasDynamicRewrite
      )
      // All parallel route branches share the same URL, so they should all
      // reach compatible leaf nodes. We capture any result.
      resultFromChildren = result
    }
    if (resultFromChildren !== null) {
      return resultFromChildren
    }
    // Defensive fallback: no children returned a result. This shouldn't happen
    // for valid route trees, but handle it gracefully.
    if (existingEntry !== null) {
      return existingEntry
    }
    return writeRouteIntoCache(
      now,
      pathname as NormalizedPathname,
      fullTree,
      metadataVaryPath,
      couldBeIntercepted,
      canonicalUrl,
      isPPREnabled
    )
  }

  // Reached a page node. Create/get the route cache entry and store as a
  // pattern. First, check if there's already a pattern for this route.
  if (knownRoutePart.pattern !== null) {
    // If this route has a dynamic rewrite, mark the existing pattern.
    if (hasDynamicRewrite) {
      knownRoutePart.pattern.hasDynamicRewrite = true
    }
    return knownRoutePart.pattern
  }

  // Get or create the entry
  let entry: FulfilledRouteCacheEntry
  if (existingEntry !== null) {
    // Already have a fulfilled entry, use it directly. It's already in the
    // route cache map.
    entry = existingEntry
  } else {
    // Create the entry and insert it into the route cache map.
    entry = writeRouteIntoCache(
      now,
      pathname as NormalizedPathname,
      fullTree,
      metadataVaryPath,
      couldBeIntercepted,
      canonicalUrl,
      isPPREnabled
    )
  }

  if (hasDynamicRewrite) {
    entry.hasDynamicRewrite = true
  }

  // Store as pattern
  knownRoutePart.pattern = entry
  return entry
}

/**
 * Attempts to match a URL against learned route patterns.
 *
 * Returns a synthetic FulfilledRouteCacheEntry if the URL matches a known
 * pattern, or null if no match is found (fall back to server resolution).
 */
export function matchKnownRoute(
  pathname: string,
  search: NormalizedSearch
): FulfilledRouteCacheEntry | null {
  const pathnameParts = pathname.split('/').filter((p) => p !== '')
  const resolvedParams: ResolvedParams = new Map()
  const match = matchKnownRoutePart(
    knownRouteTreeRoot,
    pathnameParts,
    0,
    resolvedParams
  )

  if (match === null) {
    return null
  }

  const matchedPart = match.part
  const pattern = match.pattern

  // If the pattern could be intercepted, we can't safely use it for prediction
  // because the route structure may vary based on the Next-Url header.
  if (pattern.couldBeIntercepted) {
    return null
  }

  // "Reify" the pattern: clone the template tree with concrete param values.
  // This substitutes resolved params (e.g., slug: "hello") into dynamic
  // segments and recomputes vary paths for correct segment cache keying.
  const acc: ReifyAccumulator = { metadataVaryPath: null }
  const reifiedTree = reifyRouteTree(
    pattern.tree,
    resolvedParams,
    search,
    null, // Start with null partial vary path at the root
    acc
  )

  // The metadata tree is a flat page node without the intermediate layout
  // structure. Clone it with the updated metadata vary path collected during
  // the main tree traversal.
  const metadataVaryPath = acc.metadataVaryPath
  if (metadataVaryPath === null) {
    // This shouldn't be reachable for a valid route tree.
    return null
  }
  const reifiedMetadata = createMetadataRouteTree(metadataVaryPath)

  // Create a synthetic (predicted) entry and store it as the new pattern.
  //
  // Why replace the pattern? We intentionally update the pattern with this
  // synthetic entry so that if our prediction was wrong (server returns a
  // different pathname due to dynamic rewrite), the entry gets marked with
  // hasDynamicRewrite. Future predictions for this route will see the flag
  // and bail out to server resolution instead of making the same mistake.
  const syntheticEntry: FulfilledRouteCacheEntry = {
    canonicalUrl: pathname + search,
    status: EntryStatus.Fulfilled,
    blockedTasks: null,
    tree: reifiedTree,
    metadata: reifiedMetadata,
    couldBeIntercepted: pattern.couldBeIntercepted,
    isPPREnabled: pattern.isPPREnabled,
    hasDynamicRewrite: false,
    renderedSearch: search,
    ref: null,
    size: pattern.size,
    staleAt: pattern.staleAt,
    version: pattern.version,
  }

  matchedPart.pattern = syntheticEntry

  return syntheticEntry
}

/**
 * Result of a successful match: the matched tree node and its pattern.
 * We return both because the caller needs to update the pattern after
 * creating a synthetic entry (for dynamic rewrite detection).
 */
type KnownRouteMatch = {
  part: KnownRoutePart
  pattern: FulfilledRouteCacheEntry
} | null

/**
 * Recursively matches a URL against the known route tree.
 *
 * Matching priority (most specific first):
 * 1. Static children - exact path segment match
 * 2. Dynamic child - [param], [...param], [[...param]]
 * 3. Direct pattern - when no more URL parts remain
 *
 * Collects resolved param values in resolvedParams as it traverses.
 * Returns null if no match found (caller should fall back to server).
 */
function matchKnownRoutePart(
  part: KnownRoutePart,
  pathnameParts: string[],
  partIndex: number,
  resolvedParams: ResolvedParams
): KnownRouteMatch {
  const urlPart =
    partIndex < pathnameParts.length ? pathnameParts[partIndex] : null

  // If staticChildren is null, we don't know what static routes exist at this
  // level. This happens in webpack dev mode where routes are compiled
  // on-demand. We can't safely match a dynamicChild because the URL part might
  // be a static sibling we haven't discovered yet. Example: We know
  // /blog/[slug] exists, but haven't compiled /blog/featured. A request for
  // /blog/featured would incorrectly match /blog/[slug].
  if (part.staticChildren === null) {
    // The only safe match is a direct pattern when no URL parts remain.
    if (urlPart === null) {
      const pattern = part.pattern
      if (pattern !== null && !pattern.hasDynamicRewrite) {
        return { part, pattern }
      }
    }
    return null
  }

  // Static children take priority over dynamic. This ensures /blog/featured
  // matches its own route rather than /blog/[slug].
  if (urlPart !== null) {
    const staticChild = part.staticChildren.get(urlPart)
    if (staticChild !== undefined) {
      // Check if this is an "unknown" placeholder part. These are created when
      // we learn about static siblings (from the route tree's staticSiblings
      // field) but haven't prefetched them yet. We know the path exists but
      // don't know its structure, so we can't predict it.
      if (
        staticChild.pattern === null &&
        staticChild.dynamicChild === null &&
        staticChild.staticChildren === null
      ) {
        // Bail out - server must resolve this route.
        return null
      }
      const match = matchKnownRoutePart(
        staticChild,
        pathnameParts,
        partIndex + 1,
        resolvedParams
      )
      if (match !== null) {
        return match
      }
      // Static child exists but didn't match (e.g., wrong depth).
      // Fall through to try dynamic.
    }
  }

  // Try dynamic child
  if (part.dynamicChild !== null) {
    const dynamicPart = part.dynamicChild
    const paramName = part.dynamicChildParamName
    const paramType = part.dynamicChildParamType
    const dynamicPattern = dynamicPart.pattern

    switch (paramType) {
      case 'c':
        // Required catch-all [...param]: consumes 1+ URL parts
        if (
          dynamicPattern !== null &&
          !dynamicPattern.hasDynamicRewrite &&
          urlPart !== null
        ) {
          resolvedParams.set(paramName, pathnameParts.slice(partIndex))
          return { part: dynamicPart, pattern: dynamicPattern }
        }
        break
      case 'oc':
        // Optional catch-all [[...param]]: consumes 0+ URL parts
        if (dynamicPattern !== null && !dynamicPattern.hasDynamicRewrite) {
          if (urlPart !== null) {
            resolvedParams.set(paramName, pathnameParts.slice(partIndex))
            return { part: dynamicPart, pattern: dynamicPattern }
          }
          // urlPart is null - can match with zero parts, but a direct pattern
          // (e.g., page.tsx alongside [[...param]]) takes precedence.
          if (part.pattern === null || part.pattern.hasDynamicRewrite) {
            resolvedParams.set(paramName, [])
            return { part: dynamicPart, pattern: dynamicPattern }
          }
        }
        break
      case 'd':
        // Regular dynamic [param]: consumes exactly 1 URL part.
        // Unlike catch-all which terminates here, regular dynamic must
        // continue recursing to find the leaf pattern.
        if (urlPart !== null) {
          resolvedParams.set(paramName, urlPart)
          return matchKnownRoutePart(
            dynamicPart,
            pathnameParts,
            partIndex + 1,
            resolvedParams
          )
        }
        break
      // Intercepted routes use relative path markers like (.), (..), (...)
      // Their behavior depends on navigation context (soft vs hard nav),
      // so we can't predict them client-side. Defer to server.
      case 'ci(..)(..)':
      case 'ci(.)':
      case 'ci(..)':
      case 'ci(...)':
      case 'di(..)(..)':
      case 'di(.)':
      case 'di(..)':
      case 'di(...)':
        return null
      default:
        paramType satisfies never
    }
  }

  // No children matched. If we've consumed all URL parts, check for a direct
  // pattern at this node (the route terminates here).
  if (urlPart === null) {
    const pattern = part.pattern
    if (pattern !== null && !pattern.hasDynamicRewrite) {
      return { part, pattern }
    }
  }

  return null
}

/**
 * Accumulator for collecting data during reifyRouteTree traversal.
 * metadataVaryPath is collected from the first page node encountered
 * (parallel routes may have multiple pages, but metadata uses the first).
 */
type ReifyAccumulator = {
  metadataVaryPath: PageVaryPath | null
}

/**
 * "Reify" means to make concrete - we take an abstract pattern (the template
 * route tree) and produce a concrete instance with actual param values.
 *
 * This function clones a RouteTree, substituting dynamic segment values from
 * resolvedParams and computing new vary paths. The vary path encodes param
 * values so segment cache entries can be correctly keyed.
 *
 * Example: Pattern for /blog/[slug] with resolvedParams { slug: "hello" }
 * produces a tree where segment [slug] has cacheKey "hello".
 */
function reifyRouteTree(
  pattern: RouteTree,
  resolvedParams: ResolvedParams,
  search: NormalizedSearch,
  parentPartialVaryPath: PartialSegmentVaryPath | null,
  acc: ReifyAccumulator
): RouteTree {
  const originalSegment = pattern.segment

  let newSegment = originalSegment
  let partialVaryPath: PartialSegmentVaryPath | null

  if (typeof originalSegment !== 'string') {
    // Dynamic segment: compute new cache key and append to partial vary path
    const paramName = originalSegment[0]
    const paramType = originalSegment[2]
    const staticSiblings = originalSegment[3]
    const newValue = resolvedParams.get(paramName)
    if (newValue !== undefined) {
      const newCacheKey = Array.isArray(newValue)
        ? newValue.join('/')
        : newValue
      newSegment = [paramName, newCacheKey, paramType, staticSiblings]
      partialVaryPath = appendLayoutVaryPath(
        parentPartialVaryPath,
        newCacheKey,
        paramName
      )
    } else {
      // Param not found in resolvedParams - keep original and inherit partial
      // TODO: This should never happen. Bail out with null.
      partialVaryPath = parentPartialVaryPath
    }
  } else {
    // Static segment: inherit partial vary path from parent
    partialVaryPath = parentPartialVaryPath
  }

  // Recurse into children with the (possibly updated) partial vary path
  let newSlots: Record<string, RouteTree> | null = null
  if (pattern.slots !== null) {
    newSlots = {}
    for (const key in pattern.slots) {
      newSlots[key] = reifyRouteTree(
        pattern.slots[key],
        resolvedParams,
        search,
        partialVaryPath,
        acc
      )
    }
  }

  if (pattern.isPage) {
    // Page segment: finalize with search params
    const newVaryPath = finalizePageVaryPath(
      pattern.requestKey,
      search,
      partialVaryPath
    )
    // Collect metadata vary path (first page wins, same as original algorithm)
    if (acc.metadataVaryPath === null) {
      acc.metadataVaryPath = finalizeMetadataVaryPath(
        pattern.requestKey,
        search,
        partialVaryPath
      )
    }
    return {
      requestKey: pattern.requestKey,
      segment: newSegment,
      refreshState: pattern.refreshState,
      slots: newSlots,
      isRootLayout: pattern.isRootLayout,
      hasLoadingBoundary: pattern.hasLoadingBoundary,
      hasRuntimePrefetch: pattern.hasRuntimePrefetch,
      isPage: true,
      varyPath: newVaryPath,
    }
  } else {
    // Layout segment: finalize without search params
    const newVaryPath = finalizeLayoutVaryPath(
      pattern.requestKey,
      partialVaryPath
    )
    return {
      requestKey: pattern.requestKey,
      segment: newSegment,
      refreshState: pattern.refreshState,
      slots: newSlots,
      isRootLayout: pattern.isRootLayout,
      hasLoadingBoundary: pattern.hasLoadingBoundary,
      hasRuntimePrefetch: pattern.hasRuntimePrefetch,
      isPage: false,
      varyPath: newVaryPath,
    }
  }
}

/**
 * Resets the known route tree. Called during development when routes may
 * change due to hot reloading.
 */
export function resetKnownRoutes(): void {
  knownRouteTreeRoot = createEmptyPart()
}
