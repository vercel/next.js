import { PAGE_SEGMENT_KEY } from '../../shared/lib/segment'
import { getRenderedSearch } from '../../shared/lib/router/utils/querystring'
import type {
  FlightRouterState,
  PrefetchHints,
  Segment,
  HeadData,
} from '../../shared/lib/app-router-types'
import type { PartialTransportNode } from '../../shared/lib/rsc-transport'
import {
  createSkippedSegmentData,
  segmentToTransportSegment,
} from '../../shared/lib/rsc-transport'
import type { PreloadCallbacks } from './types'
import type { LoaderTree } from '../lib/app-dir-module'
import { getLinkAndScriptTags } from './get-css-inlined-link-tags'
import { getPreloadableFonts } from './get-preloadable-fonts'
import {
  createTransportTreeFromLoaderTree,
  createRouteTreePrefetch,
} from './create-transport-tree-from-loader-tree'
import type { AppRenderContext } from './app-render'
import { hasLoadingComponentInTree } from './has-loading-component-in-tree'
import { createComponentTree } from './create-component-tree'

/**
 * The result of rendering a navigation (or refresh/action) response: the
 * transport tree, plus the head (viewport/metadata). The head is returned
 * separately rather than as part of a TransportSegmentData because its vary
 * params are accumulated during the render; the caller assembles the
 * response-level head field once the walk has completed.
 */
export type NavigationResponseTree = {
  tree: PartialTransportNode
  head: HeadData
  isHeadPartial: boolean
}

function didRouteOrPathParamChange(
  actualSegment: Segment,
  requestedSegment: Segment
): boolean {
  // The request still uses FlightRouterState, so compare its segment fields
  // directly. Page search params and the absence of router state at this
  // position are handled separately by the caller.
  if (
    typeof actualSegment === 'string' ||
    typeof requestedSegment === 'string'
  ) {
    // Static segments must have the same string. A static segment and a
    // dynamic segment always identify different routes.
    return actualSegment !== requestedSegment
  }

  // Both segments are dynamic. The param name and type identify the route
  // (e.g. [slug] versus [...slug]); the param value identifies the rendered
  // instance. A change to either means rendering must start at this level.
  // Static sibling hints at index 3 are not part of either identity.
  return (
    actualSegment[0] !== requestedSegment[0] ||
    actualSegment[2] !== requestedSegment[2] ||
    actualSegment[1] !== requestedSegment[1]
  )
}

/**
 * Use router state to decide at what common layout to render the page.
 * This can either be the common layout between two pages or a specific place to start rendering from using the "refetch" marker in the tree.
 *
 * Returns the response's transport tree, anchored at the segment this walk
 * started from, or null when nothing below this segment produced output (the
 * response carries no information about this position).
 */
export async function walkTreeWithFlightRouterState({
  loaderTreeToFilter,
  parentParams,
  flightRouterState,
  parentIsInsideSharedLayout,
  rscHead,
  injectedCSS,
  injectedJS,
  injectedFontPreloadTags,
  rootLayoutIncluded,
  ctx,
  preloadCallbacks,
  MetadataOutlet,
  hintTree,
}: {
  loaderTreeToFilter: LoaderTree
  parentParams: { [key: string]: string | string[] }
  flightRouterState?: FlightRouterState
  rscHead: HeadData
  parentIsInsideSharedLayout?: boolean
  injectedCSS: Set<string>
  injectedJS: Set<string>
  injectedFontPreloadTags: Set<string>
  rootLayoutIncluded: boolean
  ctx: AppRenderContext
  preloadCallbacks: PreloadCallbacks
  MetadataOutlet: React.ComponentType<{ tree: LoaderTree }>
  hintTree: PrefetchHints | null
}): Promise<NavigationResponseTree | null> {
  const {
    renderOpts: { nextFontManifest, experimental },
    query,
    isPrefetch,
    getDynamicParamFromSegment,
    parsedRequestHeaders,
  } = ctx
  const prefetchInliningEnabled = Boolean(experimental.prefetchInlining)
  const partialPrefetching = Boolean(ctx.renderOpts.partialPrefetching)

  const [segment, parallelRoutes, modules] = loaderTreeToFilter

  const parallelRoutesKeys = Object.keys(parallelRoutes)

  const { layout } = modules
  const isLayout = typeof layout !== 'undefined'

  /**
   * Checks if the current segment is a root layout.
   */
  const rootLayoutAtThisLevel = isLayout && !rootLayoutIncluded
  /**
   * Checks if the current segment or any level above it has a root layout.
   */
  const rootLayoutIncludedAtThisLevelOrAbove =
    rootLayoutIncluded || rootLayoutAtThisLevel

  // Because this function walks to a deeper point in the tree to start rendering we have to track the dynamic parameters up to the point where rendering starts
  const segmentParam = getDynamicParamFromSegment(loaderTreeToFilter)
  const currentParams =
    // Handle null case where dynamic param is optional
    segmentParam && segmentParam.value !== null
      ? {
          ...parentParams,
          [segmentParam.param]: segmentParam.value,
        }
      : parentParams
  const actualSegment: Segment = segmentParam
    ? segmentParam.treeSegment
    : segment

  /**
   * Decide if the current segment is where rendering has to start.
   */
  const renderComponentsOnThisLevel =
    // No further router state available
    !flightRouterState ||
    // Route structure or path param changed
    didRouteOrPathParamChange(actualSegment, flightRouterState[0]) ||
    // Normal requests omit search params, as they did with the old PAGE
    // suffix. Treat the omitted value as empty to preserve that comparison
    // behavior. HMR requests retain their actual search params.
    (actualSegment === PAGE_SEGMENT_KEY &&
      getRenderedSearch(query) !==
        (flightRouterState[5] === undefined ? '' : flightRouterState[5])) ||
    // Explicit refresh
    flightRouterState[3] === 'refetch'

  // Pre-PPR, the `loading` component signals to the router how deep to render the component tree
  // to ensure prefetches are quick and inexpensive. If there's no `loading` component anywhere in the tree being rendered,
  // the prefetch will be short-circuited to avoid requesting a potentially very expensive subtree. If there's a `loading`
  // somewhere in the tree, we'll recursively render the component tree up until we encounter that loading component, and then stop.

  // Check if we're inside the "new" part of the navigation — inside the
  // shared layout. In the case of a prefetch, this can be true even if the
  // segment matches, because the client might send a matching segment to
  // indicate that it already has the data in its cache. But in order to find
  // the correct loading boundary, we still need to track where the shared
  // layout begins.
  //
  // TODO: We should rethink the protocol for dynamic requests. It might not
  // make sense for the client to send a FlightRouterState, since that type is
  // overloaded with other concerns.
  const isInsideSharedLayout =
    renderComponentsOnThisLevel ||
    parentIsInsideSharedLayout ||
    flightRouterState[3] === 'inside-shared-layout'

  if (
    isInsideSharedLayout &&
    !experimental.isRoutePPREnabled &&
    // If PPR is disabled, and this is a request for the route tree, then we
    // never render any components. Only send the router state.
    (parsedRequestHeaders.isRouteTreePrefetchRequest ||
      // Otherwise, check for the presence of a `loading` component.
      (isPrefetch &&
        !Boolean(modules.loading) &&
        !hasLoadingComponentInTree(loaderTreeToFilter)))
  ) {
    // Send only the router state.
    // TODO: Even for a dynamic route, we should cache these responses,
    // because they do not contain any render data (neither segment data nor
    // the head). They can be made even more cacheable once we move the route
    // params into a separate data structure.
    const tree = parsedRequestHeaders.isRouteTreePrefetchRequest
      ? // Route tree prefetch requests contain some extra information
        await createRouteTreePrefetch(
          loaderTreeToFilter,
          hintTree,
          prefetchInliningEnabled,
          ctx.missingPrefetchHintPolicy,
          partialPrefetching,
          getDynamicParamFromSegment,
          rootLayoutIncluded
        )
      : await createTransportTreeFromLoaderTree(
          loaderTreeToFilter,
          hintTree,
          prefetchInliningEnabled,
          ctx.missingPrefetchHintPolicy,
          partialPrefetching,
          getDynamicParamFromSegment,
          rootLayoutIncluded
        )

    return {
      tree,
      head: [null, null],
      isHeadPartial: true,
    }
  }

  // Similar to the previous branch. This flag is sent by the client to request
  // only the metadata for a page. No segment data.
  if (flightRouterState && flightRouterState[3] === 'metadata-only') {
    const tree = parsedRequestHeaders.isRouteTreePrefetchRequest
      ? await createRouteTreePrefetch(
          loaderTreeToFilter,
          hintTree,
          prefetchInliningEnabled,
          ctx.missingPrefetchHintPolicy,
          partialPrefetching,
          getDynamicParamFromSegment
        )
      : await createTransportTreeFromLoaderTree(
          loaderTreeToFilter,
          hintTree,
          prefetchInliningEnabled,
          ctx.missingPrefetchHintPolicy,
          partialPrefetching,
          getDynamicParamFromSegment,
          rootLayoutIncluded
        )
    return {
      tree,
      head: rscHead,
      isHeadPartial: false,
    }
  }

  if (renderComponentsOnThisLevel) {
    // Render the component tree for this slice of the loaderTree, returned
    // as the response's transport tree.
    const tree = await createComponentTree(
      // This ensures flightRouterPath is valid and filters down the tree
      {
        ctx,
        loaderTree: loaderTreeToFilter,
        parentParams: currentParams,
        parentOptionalCatchAllParamName: null,
        parentRuntimePrefetchable: false,
        injectedCSS,
        injectedJS,
        injectedFontPreloadTags,
        // This is intentionally not "rootLayoutIncludedAtThisLevelOrAbove" as createComponentTree starts at the current level and does a check for "rootLayoutAtThisLevel" too.
        rootLayoutIncluded,
        preloadCallbacks,
        authInterrupts: experimental.authInterrupts,
        MetadataOutlet,
        isPrerendering: false,
        hintTree,
      }
    )

    return {
      tree,
      head: rscHead,
      isHeadPartial: false,
    }
  }

  // If we are not rendering on this level we need to check if the current
  // segment has a layout. If so, we need to track all the used CSS to make
  // the result consistent.
  const layoutPath = layout?.[1]
  const injectedCSSWithCurrentLayout = new Set(injectedCSS)
  const injectedJSWithCurrentLayout = new Set(injectedJS)
  const injectedFontPreloadTagsWithCurrentLayout = new Set(
    injectedFontPreloadTags
  )
  if (layoutPath) {
    getLinkAndScriptTags(
      layoutPath,
      injectedCSSWithCurrentLayout,
      injectedJSWithCurrentLayout,
      true
    )
    getPreloadableFonts(
      nextFontManifest,
      layoutPath,
      injectedFontPreloadTagsWithCurrentLayout
    )
  }

  // Walk through all parallel routes, collecting the subtrees of the slots
  // that produced output. A slot that produced nothing is omitted from the
  // children map: the response carries no information about it.
  let children: Map<string, PartialTransportNode> | undefined
  let firstSubtree: NavigationResponseTree | null = null

  for (const parallelRouteKey of parallelRoutesKeys) {
    const parallelRoute = parallelRoutes[parallelRouteKey]

    const subtreeResult = await walkTreeWithFlightRouterState({
      ctx,
      loaderTreeToFilter: parallelRoute,
      parentParams: currentParams,
      flightRouterState:
        flightRouterState && flightRouterState[1][parallelRouteKey],
      parentIsInsideSharedLayout: isInsideSharedLayout,
      rscHead,
      injectedCSS: injectedCSSWithCurrentLayout,
      injectedJS: injectedJSWithCurrentLayout,
      injectedFontPreloadTags: injectedFontPreloadTagsWithCurrentLayout,
      rootLayoutIncluded: rootLayoutIncludedAtThisLevelOrAbove,
      preloadCallbacks,
      MetadataOutlet,
      hintTree: hintTree?.slots?.[parallelRouteKey] ?? null,
    })

    if (subtreeResult === null) {
      continue
    }
    if (children === undefined) {
      children = new Map()
    }
    children.set(parallelRouteKey, subtreeResult.tree)
    if (firstSubtree === null) {
      firstSubtree = subtreeResult
    }
  }

  if (children === undefined || firstSubtree === null) {
    // Nothing below this segment produced output.
    return null
  }

  return {
    // This segment is skipped: it's on the path from the root down to the
    // rendered subtrees, so the client is expected to already have it.
    tree: {
      s: segmentToTransportSegment(actualSegment),
      d: createSkippedSegmentData(),
      c: children,
    },
    // The head is identical across all the subtrees of a response; take the
    // first one.
    head: firstSubtree.head,
    isHeadPartial: firstSubtree.isHeadPartial,
  }
}

/**
 * A simplified version of `walkTreeWithFlightRouterState` that doesn't skip
 * any layouts but returns a result of the same shape.
 * Intended to be used for instant validation, where we need the complete tree.
 */
export async function createFullTreeForNavigation({
  loaderTree,
  rscHead,
  injectedCSS,
  injectedJS,
  injectedFontPreloadTags,
  ctx,
  preloadCallbacks,
  MetadataOutlet,
}: {
  loaderTree: LoaderTree
  flightRouterState?: FlightRouterState
  rscHead: HeadData
  injectedCSS: Set<string>
  injectedJS: Set<string>
  injectedFontPreloadTags: Set<string>
  ctx: AppRenderContext
  preloadCallbacks: PreloadCallbacks
  MetadataOutlet: React.ComponentType<{ tree: LoaderTree }>
}): Promise<NavigationResponseTree> {
  const {
    renderOpts: { experimental },
    pagePath,
  } = ctx

  const hintTreeForInitialRender =
    ctx.renderOpts.prefetchHints?.[pagePath] ?? null

  const tree = await createComponentTree({
    ctx,
    loaderTree,
    parentParams: {},
    parentOptionalCatchAllParamName: null,
    parentRuntimePrefetchable: false,
    injectedCSS,
    injectedJS,
    injectedFontPreloadTags,
    rootLayoutIncluded: false,
    preloadCallbacks,
    authInterrupts: experimental.authInterrupts,
    MetadataOutlet,
    isPrerendering: false,
    hintTree: hintTreeForInitialRender,
  })

  return {
    tree,
    head: rscHead,
    isHeadPartial: false,
  }
}
