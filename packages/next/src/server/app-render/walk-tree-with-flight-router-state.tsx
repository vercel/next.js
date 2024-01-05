import type {
  FlightDataPath,
  FlightRouterState,
  FlightSegmentPath,
  Segment,
} from './types'
import React from 'react'
import {
  canSegmentBeOverridden,
  matchSegment,
} from '../../client/components/match-segments'
import type { LoaderTree } from '../lib/app-dir-module'
import { getLinkAndScriptTags } from './get-css-inlined-link-tags'
import { getPreloadableFonts } from './get-preloadable-fonts'
import {
  addSearchParamsIfPageSegment,
  createFlightRouterStateFromLoaderTree,
} from './create-flight-router-state-from-loader-tree'
import { parseLoaderTree } from './parse-loader-tree'
import type { CreateSegmentPath, AppRenderContext } from './app-render'
import { getLayerAssets } from './get-layer-assets'
import { hasLoadingComponentInTree } from './has-loading-component-in-tree'
import { createComponentTree } from './create-component-tree'
import { DEFAULT_SEGMENT_KEY } from '../../shared/lib/segment'

/**
 * Use router state to decide at what common layout to render the page.
 * This can either be the common layout between two pages or a specific place to start rendering from using the "refetch" marker in the tree.
 */
export async function walkTreeWithFlightRouterState({
  createSegmentPath,
  loaderTreeToFilter,
  parentParams,
  isFirst,
  flightRouterState,
  parentRendered,
  rscPayloadHead,
  injectedCSS,
  injectedJS,
  injectedFontPreloadTags,
  rootLayoutIncluded,
  asNotFound,
  metadataOutlet,
  ctx,
}: {
  createSegmentPath: CreateSegmentPath
  loaderTreeToFilter: LoaderTree
  parentParams: { [key: string]: string | string[] }
  isFirst: boolean
  flightRouterState?: FlightRouterState
  parentRendered?: boolean
  rscPayloadHead: React.ReactNode
  injectedCSS: Set<string>
  injectedJS: Set<string>
  injectedFontPreloadTags: Set<string>
  rootLayoutIncluded: boolean
  asNotFound?: boolean
  metadataOutlet: React.ReactNode
  ctx: AppRenderContext
}): Promise<FlightDataPath[]> {
  const {
    renderOpts: { nextFontManifest, experimental },
    query,
    isPrefetch,
    getDynamicParamFromSegment,
    componentMod: { tree: loaderTree },
  } = ctx

  const [segment, parallelRoutes, components] = loaderTreeToFilter

  const parallelRoutesKeys = Object.keys(parallelRoutes)

  const { layout } = components
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
  const segmentParam = getDynamicParamFromSegment(segment)
  const currentParams =
    // Handle null case where dynamic param is optional
    segmentParam && segmentParam.value !== null
      ? {
          ...parentParams,
          [segmentParam.param]: segmentParam.value,
        }
      : parentParams
  const actualSegment: Segment = addSearchParamsIfPageSegment(
    segmentParam ? segmentParam.treeSegment : segment,
    query
  )

  /**
   * Decide if the current segment is where rendering has to start.
   */
  const renderComponentsOnThisLevel =
    // No further router state available
    !flightRouterState ||
    // Segment in router state does not match current segment
    !matchSegment(actualSegment, flightRouterState[0]) ||
    // Last item in the tree
    parallelRoutesKeys.length === 0 ||
    // Explicit refresh
    flightRouterState[3] === 'refetch'

  const shouldSkipComponentTree =
    // loading.tsx has no effect on prefetching when PPR is enabled
    !experimental.ppr &&
    isPrefetch &&
    !Boolean(components.loading) &&
    (flightRouterState ||
      // If there is no flightRouterState, we need to check the entire loader tree, as otherwise we'll be only checking the root
      !hasLoadingComponentInTree(loaderTree))

  if (!parentRendered && renderComponentsOnThisLevel) {
    const overriddenSegment =
      flightRouterState &&
      canSegmentBeOverridden(actualSegment, flightRouterState[0])
        ? flightRouterState[0]
        : actualSegment

    const routerState = createFlightRouterStateFromLoaderTree(
      // Create router state using the slice of the loaderTree
      loaderTreeToFilter,
      getDynamicParamFromSegment,
      query
    )

    if (shouldSkipComponentTree) {
      // Send only the router state
      return [[overriddenSegment, routerState, null, null]]
    } else {
      // Create component tree using the slice of the loaderTree
      const { seedData } = await createComponentTree(
        // This ensures flightRouterPath is valid and filters down the tree
        {
          ctx,
          createSegmentPath,
          loaderTree: loaderTreeToFilter,
          parentParams: currentParams,
          firstItem: isFirst,
          injectedCSS,
          injectedJS,
          injectedFontPreloadTags,
          // This is intentionally not "rootLayoutIncludedAtThisLevelOrAbove" as createComponentTree starts at the current level and does a check for "rootLayoutAtThisLevel" too.
          rootLayoutIncluded,
          asNotFound,
          metadataOutlet,
        }
      )

      // Create head
      const { layoutOrPagePath } = parseLoaderTree(loaderTreeToFilter)
      const layerAssets = getLayerAssets({
        ctx,
        layoutOrPagePath,
        injectedCSS: new Set(injectedCSS),
        injectedJS: new Set(injectedJS),
        injectedFontPreloadTags: new Set(injectedFontPreloadTags),
      })
      const head = (
        <>
          {layerAssets}
          {rscPayloadHead}
        </>
      )

      return [[overriddenSegment, routerState, seedData, head]]
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
      ctx.clientReferenceManifest,
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

  // Walk through all parallel routes.
  const paths: FlightDataPath[] = (
    await Promise.all(
      parallelRoutesKeys.map(async (parallelRouteKey) => {
        // for (const parallelRouteKey of parallelRoutesKeys) {
        const parallelRoute = parallelRoutes[parallelRouteKey]

        const currentSegmentPath: FlightSegmentPath = isFirst
          ? [parallelRouteKey]
          : [actualSegment, parallelRouteKey]

        const path = await walkTreeWithFlightRouterState({
          ctx,
          createSegmentPath: (child) => {
            return createSegmentPath([...currentSegmentPath, ...child])
          },
          loaderTreeToFilter: parallelRoute,
          parentParams: currentParams,
          flightRouterState:
            flightRouterState && flightRouterState[1][parallelRouteKey],
          parentRendered: parentRendered || renderComponentsOnThisLevel,
          isFirst: false,
          rscPayloadHead,
          injectedCSS: injectedCSSWithCurrentLayout,
          injectedJS: injectedJSWithCurrentLayout,
          injectedFontPreloadTags: injectedFontPreloadTagsWithCurrentLayout,
          rootLayoutIncluded: rootLayoutIncludedAtThisLevelOrAbove,
          asNotFound,
          metadataOutlet,
        })

        return path
          .map((item) => {
            // we don't need to send over default routes in the flight data
            // because they are always ignored by the client, unless it's a refetch
            if (
              item[0] === DEFAULT_SEGMENT_KEY &&
              flightRouterState &&
              !!flightRouterState[1][parallelRouteKey][0] &&
              flightRouterState[1][parallelRouteKey][3] !== 'refetch'
            ) {
              return null
            }
            return [actualSegment, parallelRouteKey, ...item]
          })
          .filter(Boolean) as FlightDataPath[]
      })
    )
  ).flat()

  return paths
}
