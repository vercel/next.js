import type { FlightSegmentPath, CacheNodeSeedData } from './types'
import React, { type ReactNode } from 'react'
import { isClientReference } from '../../lib/client-reference'
import { getLayoutOrPageModule } from '../lib/app-dir-module'
import type { LoaderTree } from '../lib/app-dir-module'
import { interopDefault } from './interop-default'
import { parseLoaderTree } from './parse-loader-tree'
import type { CreateSegmentPath, AppRenderContext } from './app-render'
import { createComponentStylesAndScripts } from './create-component-styles-and-scripts'
import { getLayerAssets } from './get-layer-assets'
import { hasLoadingComponentInTree } from './has-loading-component-in-tree'
import { validateRevalidate } from '../lib/patch-fetch'
import { PARALLEL_ROUTE_DEFAULT_PATH } from '../../client/components/parallel-route-default'
import { getTracer } from '../lib/trace/tracer'
import { NextNodeServerSpan } from '../lib/trace/constants'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'

type ComponentTree = {
  seedData: CacheNodeSeedData
  styles: ReactNode
}

type Params = {
  [key: string]: string | string[]
}

/**
 * Use the provided loader tree to create the React Component tree.
 */
export function createComponentTree(props: {
  createSegmentPath: CreateSegmentPath
  loaderTree: LoaderTree
  parentParams: Params
  rootLayoutIncluded: boolean
  firstItem?: boolean
  injectedCSS: Set<string>
  injectedJS: Set<string>
  injectedFontPreloadTags: Set<string>
  asNotFound?: boolean
  metadataOutlet?: React.ReactNode
  ctx: AppRenderContext
  missingSlots?: Set<string>
}): Promise<ComponentTree> {
  return getTracer().trace(
    NextNodeServerSpan.createComponentTree,
    {
      spanName: 'build component tree',
    },
    () => createComponentTreeInternal(props)
  )
}

async function createComponentTreeInternal({
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
  missingSlots,
}: {
  createSegmentPath: CreateSegmentPath
  loaderTree: LoaderTree
  parentParams: Params
  rootLayoutIncluded: boolean
  firstItem?: boolean
  injectedCSS: Set<string>
  injectedJS: Set<string>
  injectedFontPreloadTags: Set<string>
  asNotFound?: boolean
  metadataOutlet?: React.ReactNode
  ctx: AppRenderContext
  missingSlots?: Set<string>
}): Promise<ComponentTree> {
  const {
    renderOpts: { nextConfigOutput, experimental },
    staticGenerationStore,
    componentMod: {
      NotFoundBoundary,
      LayoutRouter,
      RenderFromTemplateContext,
      ClientPageRoot,
      createUntrackedSearchParams,
      createDynamicallyTrackedSearchParams,
      serverHooks: { DynamicServerError },
      Postpone,
    },
    pagePath,
    getDynamicParamFromSegment,
    isPrefetch,
    query,
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
  const [layoutOrPageMod] = await getTracer().trace(
    NextNodeServerSpan.getLayoutOrPageModule,
    {
      hideSpan: !(isLayout || isPage),
      spanName: 'resolve segment modules',
      attributes: {
        'next.segment': segment,
      },
    },
    () => getLayoutOrPageModule(tree)
  )

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
      // force-dynamic is always incompatible with 'export'. We must interrupt the build
      throw new StaticGenBailoutError(
        `Page with \`dynamic = "force-dynamic"\` couldn't be exported. \`output: "export"\` requires all pages be renderable statically because there is not runtime server to dynamic render routes in this output format. Learn more: https://nextjs.org/docs/app/building-your-application/deploying/static-exports`
      )
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

      // TODO: (PPR) remove this bailout once PPR is the default
      if (
        staticGenerationStore.isStaticGeneration &&
        !staticGenerationStore.prerenderState
      ) {
        // If the postpone API isn't available, we can't postpone the render and
        // therefore we can't use the dynamic API.
        const err = new DynamicServerError(
          `Page with \`dynamic = "force-dynamic"\` won't be rendered statically.`
        )
        staticGenerationStore.dynamicUsageDescription = err.message
        staticGenerationStore.dynamicUsageStack = err.stack
        throw err
      }
    } else {
      staticGenerationStore.dynamicShouldError = false
      staticGenerationStore.forceStatic = dynamic === 'force-static'
    }
  }

  if (typeof layoutOrPageMod?.fetchCache === 'string') {
    staticGenerationStore.fetchCache = layoutOrPageMod?.fetchCache
  }

  if (typeof layoutOrPageMod?.revalidate !== 'undefined') {
    validateRevalidate(
      layoutOrPageMod?.revalidate,
      staticGenerationStore.urlPathname
    )
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
      !staticGenerationStore.forceStatic &&
      staticGenerationStore.isStaticGeneration &&
      ctx.defaultRevalidate === 0 &&
      // If the postpone API isn't available, we can't postpone the render and
      // therefore we can't use the dynamic API.
      !staticGenerationStore.prerenderState
    ) {
      const dynamicUsageDescription = `revalidate: 0 configured ${segment}`
      staticGenerationStore.dynamicUsageDescription = dynamicUsageDescription

      throw new DynamicServerError(dynamicUsageDescription)
    }
  }

  // If there's a dynamic usage error attached to the store, throw it.
  if (staticGenerationStore.dynamicUsageErr) {
    throw staticGenerationStore.dynamicUsageErr
  }

  const LayoutOrPage: React.ComponentType<any> | undefined = layoutOrPageMod
    ? interopDefault(layoutOrPageMod)
    : undefined

  /**
   * The React Component to render.
   */
  let Component = LayoutOrPage
  const parallelKeys = Object.keys(parallelRoutes)
  const hasSlotKey = parallelKeys.length > 1

  // TODO-APP: This is a hack to support unmatched parallel routes, which will throw `notFound()`.
  // This ensures that a `NotFoundBoundary` is available for when that happens,
  // but it's not ideal, as it needlessly invokes the `NotFound` component and renders the `RootLayout` twice.
  // We should instead look into handling the fallback behavior differently in development mode so that it doesn't
  // rely on the `NotFound` behavior.
  if (hasSlotKey && rootLayoutAtThisLevel && LayoutOrPage) {
    Component = (componentProps: { params: Params }) => {
      const NotFoundComponent = NotFound
      const RootLayoutComponent = LayoutOrPage
      return (
        <NotFoundBoundary
          notFound={
            NotFoundComponent ? (
              <>
                {layerAssets}
                {/*
                 * We are intentionally only forwarding params to the root layout, as passing any of the parallel route props
                 * might trigger `notFound()`, which is not currently supported in the root layout.
                 */}
                <RootLayoutComponent params={componentProps.params}>
                  {notFoundStyles}
                  <NotFoundComponent />
                </RootLayoutComponent>
              </>
            ) : undefined
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

  //
  // TODO: Combine this `map` traversal with the loop below that turns the array
  // into an object.
  const parallelRouteMap = await Promise.all(
    Object.keys(parallelRoutes).map(
      async (
        parallelRouteKey
      ): Promise<[string, React.ReactNode, CacheNodeSeedData | null]> => {
        const isChildrenRouteKey = parallelRouteKey === 'children'
        const currentSegmentPath: FlightSegmentPath = firstItem
          ? [parallelRouteKey]
          : [actualSegment, parallelRouteKey]

        const parallelRoute = parallelRoutes[parallelRouteKey]

        const notFoundComponent =
          NotFound && isChildrenRouteKey ? <NotFound /> : undefined

        // if we're prefetching and that there's a Loading component, we bail out
        // otherwise we keep rendering for the prefetch.
        // We also want to bail out if there's no Loading component in the tree.
        let currentStyles = undefined
        let childCacheNodeSeedData: CacheNodeSeedData | null = null

        if (
          // Before PPR, the way instant navigations work in Next.js is we
          // prefetch everything up to the first route segment that defines a
          // loading.tsx boundary. (We do the same if there's no loading
          // boundary in the entire tree, because we don't want to prefetch too
          // much) The rest of the tree is defered until the actual navigation.
          // It does not take into account whether the data is dynamic — even if
          // the tree is completely static, it will still defer everything
          // inside the loading boundary.
          //
          // This behavior predates PPR and is only relevant if the
          // PPR flag is not enabled.
          isPrefetch &&
          (Loading || !hasLoadingComponentInTree(parallelRoute)) &&
          // The approach with PPR is different — loading.tsx behaves like a
          // regular Suspense boundary and has no special behavior.
          //
          // With PPR, we prefetch as deeply as possible, and only defer when
          // dynamic data is accessed. If so, we only defer the nearest parent
          // Suspense boundary of the dynamic data access, regardless of whether
          // the boundary is defined by loading.tsx or a normal <Suspense>
          // component in userspace.
          //
          // NOTE: In practice this usually means we'll end up prefetching more
          // than we were before PPR, which may or may not be considered a
          // performance regression by some apps. The plan is to address this
          // before General Availability of PPR by introducing granular
          // per-segment fetching, so we can reuse as much of the tree as
          // possible during both prefetches and dynamic navigations. But during
          // the beta period, we should be clear about this trade off in our
          // communications.
          !experimental.ppr
        ) {
          // Don't prefetch this child. This will trigger a lazy fetch by the
          // client router.
        } else {
          // Create the child component

          if (process.env.NODE_ENV === 'development' && missingSlots) {
            // When we detect the default fallback (which triggers a 404), we collect the missing slots
            // to provide more helpful debug information during development mode.
            const parsedTree = parseLoaderTree(parallelRoute)
            if (
              parsedTree.layoutOrPagePath?.endsWith(PARALLEL_ROUTE_DEFAULT_PATH)
            ) {
              missingSlots.add(parallelRouteKey)
            }
          }

          const { seedData, styles: childComponentStyles } =
            await createComponentTreeInternal({
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
              missingSlots,
            })

          currentStyles = childComponentStyles
          childCacheNodeSeedData = seedData
        }

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
            styles={currentStyles}
          />,
          childCacheNodeSeedData,
        ]
      }
    )
  )

  // Convert the parallel route map into an object after all promises have been resolved.
  let parallelRouteProps: { [key: string]: React.ReactNode } = {}
  let parallelRouteCacheNodeSeedData: {
    [key: string]: CacheNodeSeedData | null
  } = {}
  for (const parallelRoute of parallelRouteMap) {
    const [parallelRouteKey, parallelRouteProp, flightData] = parallelRoute
    parallelRouteProps[parallelRouteKey] = parallelRouteProp
    parallelRouteCacheNodeSeedData[parallelRouteKey] = flightData
  }

  // When the segment does not have a layout or page we still have to add the layout router to ensure the path holds the loading component
  if (!Component) {
    return {
      seedData: [
        actualSegment,
        parallelRouteCacheNodeSeedData,
        // TODO: I don't think the extra fragment is necessary. React treats top
        // level fragments as transparent, i.e. the runtime behavior should be
        // identical even without it. But maybe there's some findDOMNode-related
        // reason that I'm not aware of, so I'm leaving it as-is out of extreme
        // caution, for now.
        <>{parallelRouteProps.children}</>,
      ],
      styles: layerAssets,
    }
  }

  // If force-dynamic is used and the current render supports postponing, we
  // replace it with a node that will postpone the render. This ensures that the
  // postpone is invoked during the react render phase and not during the next
  // render phase.
  // @TODO this does not actually do what it seems like it would or should do. The idea is that
  // if we are rendering in a force-dynamic mode and we can postpone we should only make the segments
  // that ask for force-dynamic to be dynamic, allowing other segments to still prerender. However
  // because this comes after the children traversal and the static generation store is mutated every segment
  // along the parent path of a force-dynamic segment will hit this condition effectively making the entire
  // render force-dynamic. We should refactor this function so that we can correctly track which segments
  // need to be dynamic
  if (
    staticGenerationStore.forceDynamic &&
    staticGenerationStore.prerenderState
  ) {
    return {
      seedData: [
        actualSegment,
        parallelRouteCacheNodeSeedData,
        <Postpone
          prerenderState={staticGenerationStore.prerenderState}
          reason='dynamic = "force-dynamic" was used'
          pathname={staticGenerationStore.urlPathname}
        />,
      ],
      styles: layerAssets,
    }
  }

  const isClientComponent = isClientReference(layoutOrPageMod)

  // We avoid cloning this object because it gets consumed here exclusively.
  const props: { [prop: string]: any } = parallelRouteProps

  // If it's a not found route, and we don't have any matched parallel
  // routes, we try to render the not found component if it exists.
  if (
    NotFound &&
    asNotFound &&
    // In development, it could hit the parallel-route-default not found, so we only need to check the segment.
    // Or if there's no parallel routes means it reaches the end.
    !parallelRouteMap.length
  ) {
    props.children = (
      <>
        <meta name="robots" content="noindex" />
        {process.env.NODE_ENV === 'development' && (
          <meta name="next-error" content="not-found" />
        )}
        {notFoundStyles}
        <NotFound />
      </>
    )
  }

  // Assign params to props
  if (
    process.env.NODE_ENV === 'development' &&
    'params' in parallelRouteProps
  ) {
    // @TODO consider making this an error and running the check in build as well
    console.error(
      `"params" is a reserved prop in Layouts and Pages and cannot be used as the name of a parallel route in ${segment}`
    )
  }
  props.params = currentParams

  let segmentElement: React.ReactNode
  if (isPage) {
    // Assign searchParams to props if this is a page
    if (isClientComponent) {
      // When we are passing searchParams to a client component Page we don't want to track the dynamic access
      // here in the RSC layer because the serialization will trigger a dynamic API usage.
      // Instead we pass the searchParams untracked but we wrap the Page in a root client component
      // which can among other things adds the dynamic tracking before rendering the page.
      // @TODO make the root wrapper part of next-app-loader so we don't need the extra client component
      props.searchParams = createUntrackedSearchParams(query)
      segmentElement = (
        <>
          {metadataOutlet}
          <ClientPageRoot props={props} Component={Component} />
        </>
      )
    } else {
      // If we are passing searchParams to a server component Page we need to track their usage in case
      // the current render mode tracks dynamic API usage.
      props.searchParams = createDynamicallyTrackedSearchParams(query)
      segmentElement = (
        <>
          {metadataOutlet}
          <Component {...props} />
        </>
      )
    }
  } else {
    // For layouts we just render the component
    segmentElement = <Component {...props} />
  }

  return {
    seedData: [
      actualSegment,
      parallelRouteCacheNodeSeedData,
      <>
        {segmentElement}
        {/* This null is currently critical. The wrapped Component can render null and if there was not fragment
            surrounding it this would look like a pending tree data state on the client which will cause an error
            and break the app. Long-term we need to move away from using null as a partial tree identifier since it
            is a valid return type for the components we wrap. Once we make this change we can safely remove the
            fragment. The reason the extra null here is required is that fragments which only have 1 child are elided.
            If the Component above renders null the actual tree data will look like `[null, null]`. If we remove the extra
            null it will look like `null` (the array is elided) and this is what confuses the client router.
            TODO-APP update router to use a Symbol for partial tree detection */}
        {null}
      </>,
    ],
    styles: layerAssets,
  }
}
