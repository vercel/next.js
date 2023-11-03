import type { ChildProp, FlightSegmentPath } from './types'
import React from 'react'
import { isClientReference } from '../../lib/client-reference'
import { getLayoutOrPageModule } from '../lib/app-dir-module'
import type { LoaderTree } from '../lib/app-dir-module'
import { interopDefault } from './interop-default'
import { preloadComponent } from './preload-component'
import { addSearchParamsIfPageSegment } from './create-flight-router-state-from-loader-tree'
import { parseLoaderTree } from './parse-loader-tree'
import type { CreateSegmentPath, AppRenderContext } from './app-render'
import { createComponentStylesAndScripts } from './create-component-styles-and-scripts'
import { getLayerAssets } from './get-layer-assets'
import { hasLoadingComponentInTree } from './has-loading-component-in-tree'

/**
 * Use the provided loader tree to create the React Component tree.
 */

export async function createComponentTree({
  createSegmentPath,
  loaderTree: tree,
  parentParams,
  firstItem,
  rootLayoutIncluded,
  injectedCSS,
  injectedJS,
  injectedFontPreloadTags,
  asNotFound,
  metadataOutlet,
  ctx,
}: {
  createSegmentPath: CreateSegmentPath
  loaderTree: LoaderTree
  parentParams: { [key: string]: any }
  rootLayoutIncluded: boolean
  firstItem?: boolean
  injectedCSS: Set<string>
  injectedJS: Set<string>
  injectedFontPreloadTags: Set<string>
  asNotFound?: boolean
  metadataOutlet?: React.ReactNode
  ctx: AppRenderContext
}): Promise<{
  Component: React.ComponentType
  styles: React.ReactNode
}> {
  const {
    renderOpts: { nextConfigOutput },
    staticGenerationStore,
    componentMod: {
      staticGenerationBailout,
      NotFoundBoundary,
      LayoutRouter,
      RenderFromTemplateContext,
      StaticGenerationSearchParamsBailoutProvider,
      serverHooks: { DynamicServerError },
    },
    pagePath,
    getDynamicParamFromSegment,
    query,
    isPrefetch,
    searchParamsProps,
  } = ctx

  const { page, layoutOrPagePath, segment, components, parallelRoutes } =
    parseLoaderTree(tree)

  const { layout, template, error, loading, 'not-found': notFound } = components

  const injectedCSSWithCurrentLayout = new Set(injectedCSS)
  const injectedJSWithCurrentLayout = new Set(injectedJS)
  const injectedFontPreloadTagsWithCurrentLayout = new Set(
    injectedFontPreloadTags
  )

  const layerAssets = getLayerAssets({
    ctx,
    layoutOrPagePath,
    injectedCSS: injectedCSSWithCurrentLayout,
    injectedJS: injectedJSWithCurrentLayout,
    injectedFontPreloadTags: injectedFontPreloadTagsWithCurrentLayout,
  })

  const [Template, templateStyles, templateScripts] = template
    ? await createComponentStylesAndScripts({
        ctx,
        filePath: template[1],
        getComponent: template[0],
        injectedCSS: injectedCSSWithCurrentLayout,
        injectedJS: injectedJSWithCurrentLayout,
      })
    : [React.Fragment]

  const [ErrorComponent, errorStyles, errorScripts] = error
    ? await createComponentStylesAndScripts({
        ctx,
        filePath: error[1],
        getComponent: error[0],
        injectedCSS: injectedCSSWithCurrentLayout,
        injectedJS: injectedJSWithCurrentLayout,
      })
    : []

  const [Loading, loadingStyles, loadingScripts] = loading
    ? await createComponentStylesAndScripts({
        ctx,
        filePath: loading[1],
        getComponent: loading[0],
        injectedCSS: injectedCSSWithCurrentLayout,
        injectedJS: injectedJSWithCurrentLayout,
      })
    : []

  const isLayout = typeof layout !== 'undefined'
  const isPage = typeof page !== 'undefined'
  const [layoutOrPageMod] = await getLayoutOrPageModule(tree)

  /**
   * Checks if the current segment is a root layout.
   */
  const rootLayoutAtThisLevel = isLayout && !rootLayoutIncluded
  /**
   * Checks if the current segment or any level above it has a root layout.
   */
  const rootLayoutIncludedAtThisLevelOrAbove =
    rootLayoutIncluded || rootLayoutAtThisLevel

  const [NotFound, notFoundStyles] = notFound
    ? await createComponentStylesAndScripts({
        ctx,
        filePath: notFound[1],
        getComponent: notFound[0],
        injectedCSS: injectedCSSWithCurrentLayout,
        injectedJS: injectedJSWithCurrentLayout,
      })
    : []

  let dynamic = layoutOrPageMod?.dynamic

  if (nextConfigOutput === 'export') {
    if (!dynamic || dynamic === 'auto') {
      dynamic = 'error'
    } else if (dynamic === 'force-dynamic') {
      staticGenerationStore.forceDynamic = true
      staticGenerationStore.dynamicShouldError = true
      staticGenerationBailout(`output: export`, {
        dynamic,
        link: 'https://nextjs.org/docs/advanced-features/static-html-export',
      })
    }
  }

  if (typeof dynamic === 'string') {
    // the nested most config wins so we only force-static
    // if it's configured above any parent that configured
    // otherwise
    if (dynamic === 'error') {
      staticGenerationStore.dynamicShouldError = true
    } else if (dynamic === 'force-dynamic') {
      staticGenerationStore.forceDynamic = true
      staticGenerationBailout(`force-dynamic`, { dynamic })
    } else {
      staticGenerationStore.dynamicShouldError = false
      if (dynamic === 'force-static') {
        staticGenerationStore.forceStatic = true
      } else {
        staticGenerationStore.forceStatic = false
      }
    }
  }

  if (typeof layoutOrPageMod?.fetchCache === 'string') {
    staticGenerationStore.fetchCache = layoutOrPageMod?.fetchCache
  }

  if (typeof layoutOrPageMod?.revalidate === 'number') {
    ctx.defaultRevalidate = layoutOrPageMod.revalidate as number

    if (
      typeof staticGenerationStore.revalidate === 'undefined' ||
      (typeof staticGenerationStore.revalidate === 'number' &&
        staticGenerationStore.revalidate > ctx.defaultRevalidate)
    ) {
      staticGenerationStore.revalidate = ctx.defaultRevalidate
    }

    if (
      staticGenerationStore.isStaticGeneration &&
      ctx.defaultRevalidate === 0
    ) {
      const dynamicUsageDescription = `revalidate: 0 configured ${segment}`
      staticGenerationStore.dynamicUsageDescription = dynamicUsageDescription

      throw new DynamicServerError(dynamicUsageDescription)
    }
  }

  if (
    staticGenerationStore?.dynamicUsageErr &&
    !staticGenerationStore.experimental.ppr
  ) {
    throw staticGenerationStore.dynamicUsageErr
  }

  const LayoutOrPage = layoutOrPageMod
    ? interopDefault(layoutOrPageMod)
    : undefined

  /**
   * The React Component to render.
   */
  let Component = LayoutOrPage
  const parallelKeys = Object.keys(parallelRoutes)
  const hasSlotKey = parallelKeys.length > 1

  if (hasSlotKey && rootLayoutAtThisLevel) {
    Component = (componentProps: any) => {
      const NotFoundComponent = NotFound
      const RootLayoutComponent = LayoutOrPage
      return (
        <NotFoundBoundary
          notFound={
            <>
              {layerAssets}
              <RootLayoutComponent>
                {notFoundStyles}
                <NotFoundComponent />
              </RootLayoutComponent>
            </>
          }
        >
          <RootLayoutComponent {...componentProps} />
        </NotFoundBoundary>
      )
    }
  }

  if (process.env.NODE_ENV === 'development') {
    const { isValidElementType } = require('next/dist/compiled/react-is')
    if (
      (isPage || typeof Component !== 'undefined') &&
      !isValidElementType(Component)
    ) {
      throw new Error(
        `The default export is not a React Component in page: "${pagePath}"`
      )
    }

    if (
      typeof ErrorComponent !== 'undefined' &&
      !isValidElementType(ErrorComponent)
    ) {
      throw new Error(
        `The default export of error is not a React Component in page: ${segment}`
      )
    }

    if (typeof Loading !== 'undefined' && !isValidElementType(Loading)) {
      throw new Error(
        `The default export of loading is not a React Component in ${segment}`
      )
    }

    if (typeof NotFound !== 'undefined' && !isValidElementType(NotFound)) {
      throw new Error(
        `The default export of notFound is not a React Component in ${segment}`
      )
    }
  }

  // Handle dynamic segment params.
  const segmentParam = getDynamicParamFromSegment(segment)
  /**
   * Create object holding the parent params and current params
   */
  const currentParams =
    // Handle null case where dynamic param is optional
    segmentParam && segmentParam.value !== null
      ? {
          ...parentParams,
          [segmentParam.param]: segmentParam.value,
        }
      : // Pass through parent params to children
        parentParams
  // Resolve the segment param
  const actualSegment = segmentParam ? segmentParam.treeSegment : segment

  // This happens outside of rendering in order to eagerly kick off data fetching for layouts / the page further down
  const parallelRouteMap = await Promise.all(
    Object.keys(parallelRoutes).map(
      async (parallelRouteKey): Promise<[string, React.ReactNode]> => {
        const isChildrenRouteKey = parallelRouteKey === 'children'
        const currentSegmentPath: FlightSegmentPath = firstItem
          ? [parallelRouteKey]
          : [actualSegment, parallelRouteKey]

        const parallelRoute = parallelRoutes[parallelRouteKey]

        const childSegment = parallelRoute[0]
        const childSegmentParam = getDynamicParamFromSegment(childSegment)
        const notFoundComponent =
          NotFound && isChildrenRouteKey ? <NotFound /> : undefined

        function getParallelRoutePair(
          currentChildProp: ChildProp,
          currentStyles: React.ReactNode
        ): [string, React.ReactNode] {
          // This is turned back into an object below.
          return [
            parallelRouteKey,
            <LayoutRouter
              parallelRouterKey={parallelRouteKey}
              segmentPath={createSegmentPath(currentSegmentPath)}
              loading={Loading ? <Loading /> : undefined}
              loadingStyles={loadingStyles}
              loadingScripts={loadingScripts}
              // TODO-APP: Add test for loading returning `undefined`. This currently can't be tested as the `webdriver()` tab will wait for the full page to load before returning.
              hasLoading={Boolean(Loading)}
              error={ErrorComponent}
              errorStyles={errorStyles}
              errorScripts={errorScripts}
              template={
                <Template>
                  <RenderFromTemplateContext />
                </Template>
              }
              templateStyles={templateStyles}
              templateScripts={templateScripts}
              notFound={notFoundComponent}
              notFoundStyles={notFoundStyles}
              childProp={currentChildProp}
              styles={currentStyles}
            />,
          ]
        }

        // if we're prefetching and that there's a Loading component, we bail out
        // otherwise we keep rendering for the prefetch.
        // We also want to bail out if there's no Loading component in the tree.
        let currentStyles = undefined
        let childElement = null
        const childPropSegment = addSearchParamsIfPageSegment(
          childSegmentParam ? childSegmentParam.treeSegment : childSegment,
          query
        )
        if (
          !(
            isPrefetch &&
            (Loading || !hasLoadingComponentInTree(parallelRoute))
          )
        ) {
          // Create the child component
          const { Component: ChildComponent, styles: childComponentStyles } =
            await createComponentTree({
              createSegmentPath: (child) => {
                return createSegmentPath([...currentSegmentPath, ...child])
              },
              loaderTree: parallelRoute,
              parentParams: currentParams,
              rootLayoutIncluded: rootLayoutIncludedAtThisLevelOrAbove,
              injectedCSS: injectedCSSWithCurrentLayout,
              injectedJS: injectedJSWithCurrentLayout,
              injectedFontPreloadTags: injectedFontPreloadTagsWithCurrentLayout,
              asNotFound,
              metadataOutlet,
              ctx,
            })

          currentStyles = childComponentStyles
          childElement = <ChildComponent />
        }

        const childProp: ChildProp = {
          current: childElement,
          segment: childPropSegment,
        }

        return getParallelRoutePair(childProp, currentStyles)
      }
    )
  )

  // Convert the parallel route map into an object after all promises have been resolved.
  const parallelRouteComponents = parallelRouteMap.reduce(
    (list, [parallelRouteKey, Comp]) => {
      list[parallelRouteKey] = Comp
      return list
    },
    {} as { [key: string]: React.ReactNode }
  )

  // When the segment does not have a layout or page we still have to add the layout router to ensure the path holds the loading component
  if (!Component) {
    return {
      Component: () => <>{parallelRouteComponents.children}</>,
      styles: layerAssets,
    }
  }

  const isClientComponent = isClientReference(layoutOrPageMod)

  // If it's a not found route, and we don't have any matched parallel
  // routes, we try to render the not found component if it exists.
  let notFoundComponent = {}
  if (
    NotFound &&
    asNotFound &&
    // In development, it could hit the parallel-route-default not found, so we only need to check the segment.
    // Or if there's no parallel routes means it reaches the end.
    !parallelRouteMap.length
  ) {
    notFoundComponent = {
      children: (
        <>
          <meta name="robots" content="noindex" />
          {process.env.NODE_ENV === 'development' && (
            <meta name="next-error" content="not-found" />
          )}
          {notFoundStyles}
          <NotFound />
        </>
      ),
    }
  }

  const props = {
    ...parallelRouteComponents,
    ...notFoundComponent,
    // TODO-APP: params and query have to be blocked parallel route names. Might have to add a reserved name list.
    // Params are always the current params that apply to the layout
    // If you have a `/dashboard/[team]/layout.js` it will provide `team` as a param but not anything further down.
    params: currentParams,
    // Query is only provided to page
    ...(() => {
      if (isClientComponent && staticGenerationStore.isStaticGeneration) {
        return {}
      }

      if (isPage) {
        return searchParamsProps
      }
    })(),
  }

  // Eagerly execute layout/page component to trigger fetches early.
  if (!isClientComponent) {
    Component = await Promise.resolve().then(() =>
      preloadComponent(Component, props)
    )
  }

  return {
    Component: () => {
      return (
        <>
          {isPage ? metadataOutlet : null}
          {/* <Component /> needs to be the first element because we use `findDOMNode` in layout router to locate it. */}
          {isPage && isClientComponent ? (
            <StaticGenerationSearchParamsBailoutProvider
              propsForComponent={props}
              Component={Component}
              isStaticGeneration={staticGenerationStore.isStaticGeneration}
            />
          ) : (
            <Component {...props} />
          )}
          {/* This null is currently critical. The wrapped Component can render null and if there was not fragment
                      surrounding it this would look like a pending tree data state on the client which will cause an errror
                      and break the app. Long-term we need to move away from using null as a partial tree identifier since it
                      is a valid return type for the components we wrap. Once we make this change we can safely remove the
                      fragment. The reason the extra null here is required is that fragments which only have 1 child are elided.
                      If the Component above renders null the actual treedata will look like `[null, null]`. If we remove the extra
                      null it will look like `null` (the array is elided) and this is what confuses the client router.
                      TODO-APP update router to use a Symbol for partial tree detection */}
          {null}
        </>
      )
    },
    styles: layerAssets,
  }
}
