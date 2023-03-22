import type { IncomingMessage, ServerResponse } from 'http'
import type {
  ChildProp,
  DynamicParamTypesShort,
  FlightData,
  FlightDataPath,
  FlightRouterState,
  FlightSegmentPath,
  RenderOpts,
  Segment,
} from './types'
import type { StaticGenerationAsyncStorage } from '../../client/components/static-generation-async-storage'
import type { RequestAsyncStorage } from '../../client/components/request-async-storage'
import type { MetadataItems } from '../../lib/metadata/resolve-metadata'
// Import builtin react directly to avoid require cache conflicts
import React from 'next/dist/compiled/react'
import ReactDOMServer from 'next/dist/compiled/react-dom/server.browser'
import { NotFound as DefaultNotFound } from '../../client/components/error'

// this needs to be required lazily so that `next-server` can set
// the env before we require
import { ParsedUrlQuery } from 'querystring'
import { NextParsedUrlQuery } from '../request-meta'
import RenderResult, { type RenderResultMetadata } from '../render-result'
import {
  renderToInitialStream,
  createBufferedTransformStream,
  continueFromInitialStream,
  streamToBufferedResult,
} from '../node-web-streams-helper'
import { matchSegment } from '../../client/components/match-segments'
import { ServerInsertedHTMLContext } from '../../shared/lib/server-inserted-html'
import { stripInternalQueries } from '../internal-utils'
import { HeadManagerContext } from '../../shared/lib/head-manager-context'
import {
  ACTION,
  NEXT_ROUTER_PREFETCH,
  NEXT_ROUTER_STATE_TREE,
  RSC,
} from '../../client/components/app-router-headers'
import { MetadataTree } from '../../lib/metadata/metadata'
import { RequestAsyncStorageWrapper } from '../async-storage/request-async-storage-wrapper'
import { StaticGenerationAsyncStorageWrapper } from '../async-storage/static-generation-async-storage-wrapper'
import { collectMetadata } from '../../lib/metadata/resolve-metadata'
import { isClientReference } from '../../lib/client-reference'
import { getLayoutOrPageModule, LoaderTree } from '../lib/app-dir-module'
import { warnOnce } from '../../shared/lib/utils/warn-once'
import { isNotFoundError } from '../../client/components/not-found'
import {
  getURLFromRedirectError,
  isRedirectError,
} from '../../client/components/redirect'
import { patchFetch } from '../lib/patch-fetch'
import { AppRenderSpan } from '../lib/trace/constants'
import { getTracer } from '../lib/trace/tracer'
import { interopDefault } from './interop-default'
import { preloadComponent } from './preload-component'
import { FlightRenderResult } from './flight-render-result'
import { ActionRenderResult } from './action-render-result'
import { createErrorHandler } from './create-error-handler'
import { createServerComponentRenderer } from './create-server-components-renderer'
import { getShortDynamicParamType } from './get-short-dynamic-param-type'
import { getSegmentParam } from './get-segment-param'
import { getCssInlinedLinkTags } from './get-css-inlined-link-tags'
import { getServerCSSForEntries } from './get-server-css-for-entries'
import { getPreloadedFontFilesInlineLinkTags } from './get-preloaded-font-files-inline-link-tags'
import { getScriptNonceFromHeader } from './get-script-nonce-from-header'
import { renderToString } from './render-to-string'
import { parseAndValidateFlightRouterState } from './parse-and-validate-flight-router-state'
import { validateURL } from './validate-url'
import {
  addSearchParamsIfPageSegment,
  createFlightRouterStateFromLoaderTree,
} from './create-flight-router-state-from-loader-tree'
import { PAGE_SEGMENT_KEY } from '../../shared/lib/constants'

export const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

export type GetDynamicParamFromSegment = (
  // [slug] / [[slug]] / [...slug]
  segment: string
) => {
  param: string
  value: string | string[] | null
  treeSegment: Segment
  type: DynamicParamTypesShort
} | null

export async function renderToHTMLOrFlight(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts
): Promise<RenderResult> {
  const isFlight = req.headers[RSC.toLowerCase()] !== undefined

  const {
    buildManifest,
    subresourceIntegrityManifest,
    serverActionsManifest,
    ComponentMod,
    dev,
    nextFontManifest,
    supportsDynamicHTML,
  } = renderOpts

  const clientReferenceManifest = renderOpts.clientReferenceManifest!
  const serverCSSManifest = renderOpts.serverCSSManifest!

  const capturedErrors: Error[] = []
  const allCapturedErrors: Error[] = []
  const isNextExport = !!renderOpts.nextExport
  const serverComponentsErrorHandler = createErrorHandler({
    _source: 'serverComponentsRenderer',
    dev,
    isNextExport,
    errorLogger: renderOpts.appDirDevErrorLogger,
    capturedErrors,
  })
  const flightDataRendererErrorHandler = createErrorHandler({
    _source: 'flightDataRenderer',
    dev,
    isNextExport,
    errorLogger: renderOpts.appDirDevErrorLogger,
    capturedErrors,
  })
  const htmlRendererErrorHandler = createErrorHandler({
    _source: 'htmlRenderer',
    dev,
    isNextExport,
    errorLogger: renderOpts.appDirDevErrorLogger,
    capturedErrors,
    allCapturedErrors,
  })

  patchFetch(ComponentMod)
  /**
   * Rules of Static & Dynamic HTML:
   *
   *    1.) We must generate static HTML unless the caller explicitly opts
   *        in to dynamic HTML support.
   *
   *    2.) If dynamic HTML support is requested, we must honor that request
   *        or throw an error. It is the sole responsibility of the caller to
   *        ensure they aren't e.g. requesting dynamic HTML for an AMP page.
   *
   * These rules help ensure that other existing features like request caching,
   * coalescing, and ISR continue working as intended.
   */
  const generateStaticHTML = supportsDynamicHTML !== true

  const staticGenerationAsyncStorage: StaticGenerationAsyncStorage =
    ComponentMod.staticGenerationAsyncStorage
  const requestAsyncStorage: RequestAsyncStorage =
    ComponentMod.requestAsyncStorage

  // we wrap the render in an AsyncLocalStorage context
  const wrappedRender = async () => {
    const staticGenerationStore = staticGenerationAsyncStorage.getStore()
    if (!staticGenerationStore) {
      throw new Error(
        `Invariant: Render expects to have staticGenerationAsyncStorage, none found`
      )
    }

    // don't modify original query object
    query = { ...query }
    stripInternalQueries(query)

    const isPrefetch =
      req.headers[NEXT_ROUTER_PREFETCH.toLowerCase()] !== undefined

    /**
     * Router state provided from the client-side router. Used to handle rendering from the common layout down.
     */
    let providedFlightRouterState = isFlight
      ? parseAndValidateFlightRouterState(
          req.headers[NEXT_ROUTER_STATE_TREE.toLowerCase()]
        )
      : undefined

    /**
     * The tree created in next-app-loader that holds component segments and modules
     */
    const loaderTree: LoaderTree = ComponentMod.tree

    /**
     * The metadata items array created in next-app-loader with all relevant information
     * that we need to resolve the final metadata.
     */

    const requestId =
      process.env.NEXT_RUNTIME === 'edge'
        ? crypto.randomUUID()
        : require('next/dist/compiled/nanoid').nanoid()

    const LayoutRouter =
      ComponentMod.LayoutRouter as typeof import('../../client/components/layout-router').default
    const RenderFromTemplateContext =
      ComponentMod.RenderFromTemplateContext as typeof import('../../client/components/render-from-template-context').default
    const createSearchParamsBailoutProxy =
      ComponentMod.createSearchParamsBailoutProxy as typeof import('../../client/components/searchparams-bailout-proxy').createSearchParamsBailoutProxy
    const StaticGenerationSearchParamsBailoutProvider =
      ComponentMod.StaticGenerationSearchParamsBailoutProvider as typeof import('../../client/components/static-generation-searchparams-bailout-provider').default

    const isStaticGeneration = staticGenerationStore.isStaticGeneration
    // During static generation we need to call the static generation bailout when reading searchParams
    const providedSearchParams = isStaticGeneration
      ? createSearchParamsBailoutProxy()
      : query
    const searchParamsProps = { searchParams: providedSearchParams }

    /**
     * Server Context is specifically only available in Server Components.
     * It has to hold values that can't change while rendering from the common layout down.
     * An example of this would be that `headers` are available but `searchParams` are not because that'd mean we have to render from the root layout down on all requests.
     */

    const serverContexts: Array<[string, any]> = [
      ['WORKAROUND', null], // TODO-APP: First value has a bug currently where the value is not set on the second request: https://github.com/facebook/react/issues/24849
    ]

    type CreateSegmentPath = (child: FlightSegmentPath) => FlightSegmentPath

    /**
     * Dynamic parameters. E.g. when you visit `/dashboard/vercel` which is rendered by `/dashboard/[slug]` the value will be {"slug": "vercel"}.
     */
    const pathParams = (renderOpts as any).params as ParsedUrlQuery

    /**
     * Parse the dynamic segment and return the associated value.
     */
    const getDynamicParamFromSegment: GetDynamicParamFromSegment = (
      // [slug] / [[slug]] / [...slug]
      segment: string
    ) => {
      const segmentParam = getSegmentParam(segment)
      if (!segmentParam) {
        return null
      }

      const key = segmentParam.param
      let value = pathParams[key]

      if (Array.isArray(value)) {
        value = value.map((i) => encodeURIComponent(i))
      } else if (typeof value === 'string') {
        value = encodeURIComponent(value)
      }

      if (!value) {
        // Handle case where optional catchall does not have a value, e.g. `/dashboard/[...slug]` when requesting `/dashboard`
        if (segmentParam.type === 'optional-catchall') {
          const type = getShortDynamicParamType(segmentParam.type)
          return {
            param: key,
            value: null,
            type: type,
            // This value always has to be a string.
            treeSegment: [key, '', type],
          }
        }
        return null
      }

      const type = getShortDynamicParamType(segmentParam.type)

      return {
        param: key,
        // The value that is passed to user code.
        value: value,
        // The value that is rendered in the router tree.
        treeSegment: [
          key,
          Array.isArray(value) ? value.join('/') : value,
          type,
        ],
        type: type,
      }
    }

    async function resolveHead({
      tree,
      parentParams,
      metadataItems,
      treePrefix = [],
    }: {
      tree: LoaderTree
      parentParams: { [key: string]: any }
      metadataItems: MetadataItems
      /** Provided tree can be nested subtree, this argument says what is the path of such subtree */
      treePrefix?: string[]
    }): Promise<[React.ReactNode, MetadataItems]> {
      const [segment, parallelRoutes, { head, page }] = tree
      const currentTreePrefix = [...treePrefix, segment]
      const isPage = typeof page !== 'undefined'
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

      const layerProps = {
        params: currentParams,
        ...(isPage && searchParamsProps),
      }

      await collectMetadata({
        loaderTree: tree,
        props: layerProps,
        array: metadataItems,
        route: currentTreePrefix
          // __PAGE__ shouldn't be shown in a route
          .filter((s) => s !== PAGE_SEGMENT_KEY)
          .join('/'),
      })

      for (const key in parallelRoutes) {
        const childTree = parallelRoutes[key]
        const [returnedHead] = await resolveHead({
          tree: childTree,
          parentParams: currentParams,
          metadataItems,
          treePrefix: currentTreePrefix,
        })
        if (returnedHead) {
          return [returnedHead, metadataItems]
        }
      }

      if (head) {
        if (process.env.NODE_ENV !== 'production') {
          warnOnce(
            `\`head.js\` is being used in route /${segment}. Please migrate to the Metadata API for an improved experience: https://beta.nextjs.org/docs/api-reference/metadata`
          )
        }

        const Head = await interopDefault(await head[0]())
        return [<Head params={currentParams} />, metadataItems]
      }

      return [null, metadataItems]
    }

    let defaultRevalidate: false | undefined | number = false

    // Collect all server CSS imports used by this specific entry (or entries, for parallel routes).
    // Not that we can't rely on the CSS manifest because it tracks CSS imports per module,
    // which can be used by multiple entries and cannot be tree-shaked in the module graph.
    // More info: https://github.com/vercel/next.js/issues/41018
    const serverCSSForEntries = getServerCSSForEntries(
      serverCSSManifest!,
      ComponentMod.pages
    )

    const assetPrefix = renderOpts.assetPrefix || ''

    const createComponentAndStyles = async ({
      filePath,
      getComponent,
      shouldPreload,
      injectedCSS,
    }: {
      filePath: string
      getComponent: () => any
      shouldPreload?: boolean
      injectedCSS: Set<string>
    }): Promise<any> => {
      const cssHrefs = getCssInlinedLinkTags(
        clientReferenceManifest,
        serverCSSManifest!,
        filePath,
        serverCSSForEntries,
        injectedCSS
      )

      const styles = cssHrefs
        ? cssHrefs.map((href, index) => (
            <link
              rel="stylesheet"
              // In dev, Safari will wrongly cache the resource if you preload it:
              // - https://github.com/vercel/next.js/issues/5860
              // - https://bugs.webkit.org/show_bug.cgi?id=187726
              // We used to add a `?ts=` query for resources in `pages` to bypass it,
              // but in this case it is fine as we don't need to preload the styles.
              href={`${assetPrefix}/_next/${href}`}
              // @ts-ignore
              precedence={shouldPreload ? 'high' : undefined}
              key={index}
            />
          ))
        : null

      const Comp = interopDefault(await getComponent())

      return [Comp, styles]
    }

    /**
     * Use the provided loader tree to create the React Component tree.
     */
    const createComponentTree = async ({
      createSegmentPath,
      loaderTree: tree,
      parentParams,
      firstItem,
      rootLayoutIncluded,
      injectedCSS,
      injectedFontPreloadTags,
      asNotFound,
    }: {
      createSegmentPath: CreateSegmentPath
      loaderTree: LoaderTree
      parentParams: { [key: string]: any }
      rootLayoutIncluded: boolean
      firstItem?: boolean
      injectedCSS: Set<string>
      injectedFontPreloadTags: Set<string>
      asNotFound?: boolean
    }): Promise<{ Component: React.ComponentType }> => {
      const [segment, parallelRoutes, components] = tree
      const {
        layout,
        template,
        error,
        loading,
        page,
        'not-found': notFound,
      } = components
      const layoutOrPagePath = layout?.[1] || page?.[1]

      const injectedCSSWithCurrentLayout = new Set(injectedCSS)
      const stylesheets: string[] = layoutOrPagePath
        ? getCssInlinedLinkTags(
            clientReferenceManifest,
            serverCSSManifest!,
            layoutOrPagePath,
            serverCSSForEntries,
            injectedCSSWithCurrentLayout,
            true
          )
        : []

      const injectedFontPreloadTagsWithCurrentLayout = new Set(
        injectedFontPreloadTags
      )
      const preloadedFontFiles = layoutOrPagePath
        ? getPreloadedFontFilesInlineLinkTags(
            serverCSSManifest!,
            nextFontManifest,
            serverCSSForEntries,
            layoutOrPagePath,
            injectedFontPreloadTagsWithCurrentLayout
          )
        : []

      const [Template, templateStyles] = template
        ? await createComponentAndStyles({
            filePath: template[1],
            getComponent: template[0],
            shouldPreload: true,
            injectedCSS: injectedCSSWithCurrentLayout,
          })
        : [React.Fragment]

      const [ErrorComponent, errorStyles] = error
        ? await createComponentAndStyles({
            filePath: error[1],
            getComponent: error[0],
            injectedCSS: injectedCSSWithCurrentLayout,
          })
        : []

      const [Loading, loadingStyles] = loading
        ? await createComponentAndStyles({
            filePath: loading[1],
            getComponent: loading[0],
            injectedCSS: injectedCSSWithCurrentLayout,
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
        ? await createComponentAndStyles({
            filePath: notFound[1],
            getComponent: notFound[0],
            injectedCSS: injectedCSSWithCurrentLayout,
          })
        : rootLayoutAtThisLevel
        ? [DefaultNotFound]
        : []

      if (typeof layoutOrPageMod?.dynamic === 'string') {
        // the nested most config wins so we only force-static
        // if it's configured above any parent that configured
        // otherwise
        if (layoutOrPageMod.dynamic === 'error') {
          staticGenerationStore.dynamicShouldError = true
        } else {
          staticGenerationStore.dynamicShouldError = false
          if (layoutOrPageMod.dynamic === 'force-static') {
            staticGenerationStore.forceStatic = true
          } else {
            staticGenerationStore.forceStatic = false
          }
        }
      }

      if (typeof layoutOrPageMod?.revalidate === 'number') {
        defaultRevalidate = layoutOrPageMod.revalidate as number

        if (
          typeof staticGenerationStore.revalidate === 'undefined' ||
          staticGenerationStore.revalidate > defaultRevalidate
        ) {
          staticGenerationStore.revalidate = defaultRevalidate
        }

        if (
          staticGenerationStore.isStaticGeneration &&
          defaultRevalidate === 0
        ) {
          const { DynamicServerError } =
            ComponentMod.serverHooks as typeof import('../../client/components/hooks-server-context')

          const dynamicUsageDescription = `revalidate: 0 configured ${segment}`
          staticGenerationStore.dynamicUsageDescription =
            dynamicUsageDescription

          throw new DynamicServerError(dynamicUsageDescription)
        }
      }

      /**
       * The React Component to render.
       */
      let Component = layoutOrPageMod
        ? interopDefault(layoutOrPageMod)
        : undefined

      if (dev) {
        const { isValidElementType } = require('next/dist/compiled/react-is')
        if (
          (isPage || typeof Component !== 'undefined') &&
          !isValidElementType(Component)
        ) {
          throw new Error(
            `The default export is not a React Component in page: "${pathname}"`
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

        if (
          !isClientReference(layoutOrPageMod) &&
          layoutOrPageMod?.config?.amp
        ) {
          throw new Error(
            'AMP is not supported in the app directory. If you need to use AMP it will continue to be supported in the pages directory.'
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
            const currentSegmentPath: FlightSegmentPath = firstItem
              ? [parallelRouteKey]
              : [actualSegment, parallelRouteKey]

            const parallelRoute = parallelRoutes[parallelRouteKey]
            const childSegment = parallelRoute[0]
            const childSegmentParam = getDynamicParamFromSegment(childSegment)

            if (isPrefetch && Loading) {
              const childProp: ChildProp = {
                // Null indicates the tree is not fully rendered
                current: null,
                segment: addSearchParamsIfPageSegment(
                  childSegmentParam
                    ? childSegmentParam.treeSegment
                    : childSegment,
                  query
                ),
              }

              // This is turned back into an object below.
              return [
                parallelRouteKey,
                <LayoutRouter
                  parallelRouterKey={parallelRouteKey}
                  segmentPath={createSegmentPath(currentSegmentPath)}
                  loading={Loading ? <Loading /> : undefined}
                  loadingStyles={loadingStyles}
                  hasLoading={Boolean(Loading)}
                  error={ErrorComponent}
                  errorStyles={errorStyles}
                  template={
                    <Template>
                      <RenderFromTemplateContext />
                    </Template>
                  }
                  templateStyles={templateStyles}
                  notFound={NotFound ? <NotFound /> : undefined}
                  notFoundStyles={notFoundStyles}
                  childProp={childProp}
                />,
              ]
            }

            // Create the child component
            const { Component: ChildComponent } = await createComponentTree({
              createSegmentPath: (child) => {
                return createSegmentPath([...currentSegmentPath, ...child])
              },
              loaderTree: parallelRoute,
              parentParams: currentParams,
              rootLayoutIncluded: rootLayoutIncludedAtThisLevelOrAbove,
              injectedCSS: injectedCSSWithCurrentLayout,
              injectedFontPreloadTags: injectedFontPreloadTagsWithCurrentLayout,
            })

            const childProp: ChildProp = {
              current: <ChildComponent />,
              segment: addSearchParamsIfPageSegment(
                childSegmentParam
                  ? childSegmentParam.treeSegment
                  : childSegment,
                query
              ),
            }

            const segmentPath = createSegmentPath(currentSegmentPath)

            // This is turned back into an object below.
            return [
              parallelRouteKey,
              <LayoutRouter
                parallelRouterKey={parallelRouteKey}
                segmentPath={segmentPath}
                error={ErrorComponent}
                errorStyles={errorStyles}
                loading={Loading ? <Loading /> : undefined}
                loadingStyles={loadingStyles}
                // TODO-APP: Add test for loading returning `undefined`. This currently can't be tested as the `webdriver()` tab will wait for the full page to load before returning.
                hasLoading={Boolean(Loading)}
                template={
                  <Template>
                    <RenderFromTemplateContext />
                  </Template>
                }
                templateStyles={templateStyles}
                notFound={NotFound ? <NotFound /> : undefined}
                notFoundStyles={notFoundStyles}
                asNotFound={asNotFound}
                childProp={childProp}
              />,
            ]
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
        }
      }

      const isClientComponent = isClientReference(layoutOrPageMod)

      const props = {
        ...parallelRouteComponents,
        // TODO-APP: params and query have to be blocked parallel route names. Might have to add a reserved name list.
        // Params are always the current params that apply to the layout
        // If you have a `/dashboard/[team]/layout.js` it will provide `team` as a param but not anything further down.
        params: currentParams,
        // Query is only provided to page
        ...(() => {
          if (isClientComponent && isStaticGeneration) {
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
              {/* <Component /> needs to be the first element because we use `findDOMONode` in layout router to locate it. */}
              {isPage && isClientComponent && isStaticGeneration ? (
                <StaticGenerationSearchParamsBailoutProvider
                  propsForComponent={props}
                  Component={Component}
                />
              ) : (
                <Component {...props} />
              )}
              {preloadedFontFiles?.length === 0 ? (
                <link
                  data-next-font={
                    nextFontManifest?.appUsingSizeAdjust ? 'size-adjust' : ''
                  }
                  rel="preconnect"
                  href="/"
                  crossOrigin="anonymous"
                />
              ) : null}
              {preloadedFontFiles
                ? preloadedFontFiles.map((fontFile) => {
                    const ext = /\.(woff|woff2|eot|ttf|otf)$/.exec(fontFile)![1]
                    return (
                      <link
                        key={fontFile}
                        rel="preload"
                        href={`${assetPrefix}/_next/${fontFile}`}
                        as="font"
                        type={`font/${ext}`}
                        crossOrigin="anonymous"
                        data-next-font={
                          fontFile.includes('-s') ? 'size-adjust' : ''
                        }
                      />
                    )
                  })
                : null}
              {stylesheets
                ? stylesheets.map((href, index) => (
                    <link
                      rel="stylesheet"
                      // In dev, Safari will wrongly cache the resource if you preload it:
                      // - https://github.com/vercel/next.js/issues/5860
                      // - https://bugs.webkit.org/show_bug.cgi?id=187726
                      // We used to add a `?ts=` query for resources in `pages` to bypass it,
                      // but in this case it is fine as we don't need to preload the styles.
                      href={`${assetPrefix}/_next/${href}`}
                      // `Precedence` is an opt-in signal for React to handle
                      // resource loading and deduplication, etc:
                      // https://github.com/facebook/react/pull/25060
                      // @ts-ignore
                      precedence="next.js"
                      key={index}
                    />
                  ))
                : null}
            </>
          )
        },
      }
    }

    // Handle Flight render request. This is only used when client-side navigating. E.g. when you `router.push('/dashboard')` or `router.reload()`.
    const generateFlight = async (): Promise<RenderResult> => {
      /**
       * Use router state to decide at what common layout to render the page.
       * This can either be the common layout between two pages or a specific place to start rendering from using the "refetch" marker in the tree.
       */
      const walkTreeWithFlightRouterState = async ({
        createSegmentPath,
        loaderTreeToFilter,
        parentParams,
        isFirst,
        flightRouterState,
        parentRendered,
        rscPayloadHead,
        injectedCSS,
        injectedFontPreloadTags,
        rootLayoutIncluded,
      }: {
        createSegmentPath: CreateSegmentPath
        loaderTreeToFilter: LoaderTree
        parentParams: { [key: string]: string | string[] }
        isFirst: boolean
        flightRouterState?: FlightRouterState
        parentRendered?: boolean
        rscPayloadHead: React.ReactNode
        injectedCSS: Set<string>
        injectedFontPreloadTags: Set<string>
        rootLayoutIncluded: boolean
      }): Promise<FlightDataPath> => {
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

        if (!parentRendered && renderComponentsOnThisLevel) {
          return [
            actualSegment,
            // Create router state using the slice of the loaderTree
            createFlightRouterStateFromLoaderTree(
              loaderTreeToFilter,
              getDynamicParamFromSegment,
              query
            ),
            // Check if one level down from the common layout has a loading component. If it doesn't only provide the router state as part of the Flight data.
            isPrefetch && !Boolean(components.loading)
              ? null
              : // Create component tree using the slice of the loaderTree
                // @ts-expect-error TODO-APP: fix async component type
                React.createElement(async () => {
                  const { Component } = await createComponentTree(
                    // This ensures flightRouterPath is valid and filters down the tree
                    {
                      createSegmentPath: (child) => {
                        return createSegmentPath(child)
                      },
                      loaderTree: loaderTreeToFilter,
                      parentParams: currentParams,
                      firstItem: isFirst,
                      injectedCSS,
                      injectedFontPreloadTags,
                      // This is intentionally not "rootLayoutIncludedAtThisLevelOrAbove" as createComponentTree starts at the current level and does a check for "rootLayoutAtThisLevel" too.
                      rootLayoutIncluded: rootLayoutIncluded,
                    }
                  )

                  return <Component />
                }),
            isPrefetch && !Boolean(components.loading) ? null : rscPayloadHead,
          ]
        }

        // If we are not rendering on this level we need to check if the current
        // segment has a layout. If so, we need to track all the used CSS to make
        // the result consistent.
        const layoutPath = layout?.[1]
        const injectedCSSWithCurrentLayout = new Set(injectedCSS)
        const injectedFontPreloadTagsWithCurrentLayout = new Set(
          injectedFontPreloadTags
        )
        if (layoutPath) {
          getCssInlinedLinkTags(
            clientReferenceManifest,
            serverCSSManifest!,
            layoutPath,
            serverCSSForEntries,
            injectedCSSWithCurrentLayout,
            true
          )
          getPreloadedFontFilesInlineLinkTags(
            serverCSSManifest!,
            nextFontManifest,
            serverCSSForEntries,
            layoutPath,
            injectedFontPreloadTagsWithCurrentLayout
          )
        }

        // Walk through all parallel routes.
        for (const parallelRouteKey of parallelRoutesKeys) {
          const parallelRoute = parallelRoutes[parallelRouteKey]

          const currentSegmentPath: FlightSegmentPath = isFirst
            ? [parallelRouteKey]
            : [actualSegment, parallelRouteKey]

          const path = await walkTreeWithFlightRouterState({
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
            injectedFontPreloadTags: injectedFontPreloadTagsWithCurrentLayout,
            rootLayoutIncluded: rootLayoutIncludedAtThisLevelOrAbove,
          })

          if (typeof path[path.length - 1] !== 'string') {
            return [actualSegment, parallelRouteKey, ...path]
          }
        }

        return [actualSegment]
      }

      const [resolvedHead, metadataItems] = await resolveHead({
        tree: loaderTree,
        parentParams: {},
        metadataItems: [],
      })
      // Flight data that is going to be passed to the browser.
      // Currently a single item array but in the future multiple patches might be combined in a single request.
      const flightData: FlightData = [
        (
          await walkTreeWithFlightRouterState({
            createSegmentPath: (child) => child,
            loaderTreeToFilter: loaderTree,
            parentParams: {},
            flightRouterState: providedFlightRouterState,
            isFirst: true,
            // For flight, render metadata inside leaf page
            rscPayloadHead: (
              <>
                {/* Adding key={requestId} to make metadata remount for each render */}
                {/* @ts-expect-error allow to use async server component */}
                <MetadataTree key={requestId} metadata={metadataItems} />
                {resolvedHead}
              </>
            ),
            injectedCSS: new Set(),
            injectedFontPreloadTags: new Set(),
            rootLayoutIncluded: false,
          })
        ).slice(1),
      ]

      // For app dir, use the bundled version of Fizz renderer (renderToReadableStream)
      // which contains the subset React.
      const readable = ComponentMod.renderToReadableStream(
        flightData,
        clientReferenceManifest.clientModules,
        {
          context: serverContexts,
          onError: flightDataRendererErrorHandler,
        }
      ).pipeThrough(createBufferedTransformStream())

      return new FlightRenderResult(readable)
    }

    if (isFlight && !staticGenerationStore.isStaticGeneration) {
      return generateFlight()
    }

    // Below this line is handling for rendering to HTML.

    // AppRouter is provided by next-app-loader
    const AppRouter =
      ComponentMod.AppRouter as typeof import('../../client/components/app-router').default

    const GlobalError = interopDefault(
      /** GlobalError can be either the default error boundary or the overwritten app/global-error.js **/
      ComponentMod.GlobalError as typeof import('../../client/components/error-boundary').default
    )

    let serverComponentsInlinedTransformStream: TransformStream<
      Uint8Array,
      Uint8Array
    > = new TransformStream()

    const initialCanonicalUrl = validateURL(req.url)

    // Get the nonce from the incoming request if it has one.
    const csp = req.headers['content-security-policy']
    let nonce: string | undefined
    if (csp && typeof csp === 'string') {
      nonce = getScriptNonceFromHeader(csp)
    }

    const serverComponentsRenderOpts = {
      transformStream: serverComponentsInlinedTransformStream,
      clientReferenceManifest,
      serverContexts,
      rscChunks: [],
    }

    const validateRootLayout = dev
      ? {
          validateRootLayout: {
            assetPrefix: renderOpts.assetPrefix,
            getTree: () =>
              createFlightRouterStateFromLoaderTree(
                loaderTree,
                getDynamicParamFromSegment,
                query
              ),
          },
        }
      : {}

    const [initialHead, metadataItems] = await resolveHead({
      tree: loaderTree,
      parentParams: {},
      metadataItems: [],
    })

    /**
     * A new React Component that renders the provided React Component
     * using Flight which can then be rendered to HTML.
     */
    const ServerComponentsRenderer = createServerComponentRenderer<{
      asNotFound: boolean
    }>(
      async (props) => {
        // Create full component tree from root to leaf.
        const { Component: ComponentTree } = await createComponentTree({
          createSegmentPath: (child) => child,
          loaderTree: loaderTree,
          parentParams: {},
          firstItem: true,
          injectedCSS: new Set(),
          injectedFontPreloadTags: new Set(),
          rootLayoutIncluded: false,
          asNotFound: props.asNotFound,
        })

        const initialTree = createFlightRouterStateFromLoaderTree(
          loaderTree,
          getDynamicParamFromSegment,
          query
        )

        return (
          <>
            <AppRouter
              assetPrefix={assetPrefix}
              initialCanonicalUrl={initialCanonicalUrl}
              initialTree={initialTree}
              initialHead={
                <>
                  {/* Adding key={requestId} to make metadata remount for each render */}
                  {/* @ts-expect-error allow to use async server component */}
                  <MetadataTree key={requestId} metadata={metadataItems} />
                  {initialHead}
                </>
              }
              globalErrorComponent={GlobalError}
            >
              <ComponentTree />
            </AppRouter>
          </>
        )
      },
      ComponentMod,
      serverComponentsRenderOpts,
      serverComponentsErrorHandler,
      nonce
    )

    const serverInsertedHTMLCallbacks: Set<() => React.ReactNode> = new Set()
    function InsertedHTML({ children }: { children: JSX.Element }) {
      // Reset addInsertedHtmlCallback on each render
      serverInsertedHTMLCallbacks.clear()
      const addInsertedHtml = React.useCallback(
        (handler: () => React.ReactNode) => {
          serverInsertedHTMLCallbacks.add(handler)
        },
        []
      )

      return (
        <HeadManagerContext.Provider
          value={{
            appDir: true,
            nonce,
          }}
        >
          <ServerInsertedHTMLContext.Provider value={addInsertedHtml}>
            {children}
          </ServerInsertedHTMLContext.Provider>
        </HeadManagerContext.Provider>
      )
    }

    const bodyResult = getTracer().wrap(
      AppRenderSpan.getBodyResult,
      {
        spanName: `render route (app) ${pathname}`,
      },
      async ({
        asNotFound,
      }: {
        /**
         * This option is used to indicate that the page should be rendered as
         * if it was not found. When it's enabled, instead of rendering the
         * page component, it renders the not-found segment.
         */
        asNotFound?: boolean
      }) => {
        const polyfills = buildManifest.polyfillFiles
          .filter(
            (polyfill) =>
              polyfill.endsWith('.js') && !polyfill.endsWith('.module.js')
          )
          .map((polyfill) => ({
            src: `${assetPrefix}/_next/${polyfill}`,
            integrity: subresourceIntegrityManifest?.[polyfill],
          }))

        const content = (
          <InsertedHTML>
            <ServerComponentsRenderer asNotFound={!!asNotFound} />
          </InsertedHTML>
        )

        let polyfillsFlushed = false
        let flushedErrorMetaTagsUntilIndex = 0
        const getServerInsertedHTML = () => {
          // Loop through all the errors that have been captured but not yet
          // flushed.
          const errorMetaTags = []
          for (
            ;
            flushedErrorMetaTagsUntilIndex < allCapturedErrors.length;
            flushedErrorMetaTagsUntilIndex++
          ) {
            const error = allCapturedErrors[flushedErrorMetaTagsUntilIndex]
            if (isNotFoundError(error)) {
              errorMetaTags.push(
                <meta name="robots" content="noindex" key={error.digest} />
              )
            } else if (isRedirectError(error)) {
              const redirectUrl = getURLFromRedirectError(error)
              if (redirectUrl) {
                errorMetaTags.push(
                  <meta
                    httpEquiv="refresh"
                    content={`0;url=${redirectUrl}`}
                    key={error.digest}
                  />
                )
              }
            }
          }

          const flushed = renderToString(
            <>
              {Array.from(serverInsertedHTMLCallbacks).map((callback) =>
                callback()
              )}
              {polyfillsFlushed
                ? null
                : polyfills?.map((polyfill) => {
                    return (
                      <script
                        key={polyfill.src}
                        src={polyfill.src}
                        integrity={polyfill.integrity}
                        noModule={true}
                        nonce={nonce}
                      />
                    )
                  })}
              {errorMetaTags}
            </>
          )
          polyfillsFlushed = true
          return flushed
        }

        try {
          const renderStream = await renderToInitialStream({
            ReactDOMServer,
            element: content,
            streamOptions: {
              onError: htmlRendererErrorHandler,
              nonce,
              // Include hydration scripts in the HTML
              bootstrapScripts: [
                ...(subresourceIntegrityManifest
                  ? buildManifest.rootMainFiles.map((src) => ({
                      src: `${assetPrefix}/_next/` + src,
                      integrity: subresourceIntegrityManifest[src],
                    }))
                  : buildManifest.rootMainFiles.map(
                      (src) => `${assetPrefix}/_next/` + src
                    )),
              ],
            },
          })

          const result = await continueFromInitialStream(renderStream, {
            dataStream: serverComponentsInlinedTransformStream?.readable,
            generateStaticHTML:
              staticGenerationStore.isStaticGeneration || generateStaticHTML,
            getServerInsertedHTML,
            serverInsertedHTMLToHead: true,
            ...validateRootLayout,
          })

          return result
        } catch (err: any) {
          const shouldNotIndex = isNotFoundError(err)
          if (isNotFoundError(err)) {
            res.statusCode = 404
          }
          if (isRedirectError(err)) {
            res.statusCode = 307
          }

          const renderStream = await renderToInitialStream({
            ReactDOMServer,
            element: (
              <html id="__next_error__">
                <head>
                  {shouldNotIndex ? (
                    <meta name="robots" content="noindex" />
                  ) : null}
                </head>
                <body></body>
              </html>
            ),
            streamOptions: {
              nonce,
              // Include hydration scripts in the HTML
              bootstrapScripts: subresourceIntegrityManifest
                ? buildManifest.rootMainFiles.map((src) => ({
                    src: `${assetPrefix}/_next/` + src,
                    integrity: subresourceIntegrityManifest[src],
                  }))
                : buildManifest.rootMainFiles.map(
                    (src) => `${assetPrefix}/_next/` + src
                  ),
            },
          })

          return await continueFromInitialStream(renderStream, {
            dataStream: serverComponentsInlinedTransformStream?.readable,
            generateStaticHTML: staticGenerationStore.isStaticGeneration,
            getServerInsertedHTML,
            serverInsertedHTMLToHead: true,
            ...validateRootLayout,
          })
        }
      }
    )

    // For action requests, we handle them differently with a special render result.
    let actionId = req.headers[ACTION.toLowerCase()] as string
    const isFormAction =
      req.method === 'POST' &&
      req.headers['content-type'] === 'application/x-www-form-urlencoded'
    const isFetchAction =
      actionId !== undefined &&
      typeof actionId === 'string' &&
      req.method === 'POST'

    if (isFetchAction || isFormAction) {
      if (process.env.NEXT_RUNTIME !== 'edge') {
        const { parseBody } =
          require('../api-utils/node') as typeof import('../api-utils/node')
        const actionData = (await parseBody(req, '1mb')) || {}
        let bound = []

        if (isFormAction) {
          actionId = actionData.$$id as string
          if (!actionId) {
            throw new Error('Invariant: missing action ID.')
          }
          const formData = new URLSearchParams(actionData)
          formData.delete('$$id')
          bound = [formData]
        } else {
          bound = actionData.bound || []
        }

        const workerName = 'app' + renderOpts.pathname
        const actionModId = serverActionsManifest[actionId].workers[workerName]

        const actionHandler =
          ComponentMod.__next_app_webpack_require__(actionModId)

        try {
          const result = new ActionRenderResult(
            JSON.stringify([await actionHandler(actionId, bound)])
          )
          // For form actions, we need to continue rendering the page.
          if (isFetchAction) {
            return result
          }
        } catch (err) {
          if (isRedirectError(err)) {
            if (isFetchAction) {
              throw new Error('Invariant: not implemented.')
            }
            const redirectUrl = getURLFromRedirectError(err)
            res.statusCode = 303
            res.setHeader('Location', redirectUrl)
            return new ActionRenderResult(JSON.stringify({}))
          } else if (isNotFoundError(err)) {
            if (isFetchAction) {
              throw new Error('Invariant: not implemented.')
            }
            res.statusCode = 404
            return new RenderResult(await bodyResult({ asNotFound: true }))
          }

          if (isFetchAction) {
            res.statusCode = 500
            return new RenderResult(
              (err as Error)?.message ?? 'Internal Server Error'
            )
          }

          throw err
        }
      } else {
        throw new Error('Not implemented in Edge Runtime.')
      }
    }
    // End of action request handling.

    const renderResult = new RenderResult(await bodyResult({}))

    if (staticGenerationStore.pendingRevalidates) {
      await Promise.all(staticGenerationStore.pendingRevalidates)
    }

    if (staticGenerationStore.isStaticGeneration) {
      const htmlResult = await streamToBufferedResult(renderResult)

      // if we encountered any unexpected errors during build
      // we fail the prerendering phase and the build
      if (capturedErrors.length > 0) {
        throw capturedErrors[0]
      }

      // TODO-APP: derive this from same pass to prevent additional
      // render during static generation
      const filteredFlightData = await streamToBufferedResult(
        await generateFlight()
      )

      if (staticGenerationStore.forceStatic === false) {
        staticGenerationStore.revalidate = 0
      }

      const extraRenderResultMeta: RenderResultMetadata = {
        pageData: filteredFlightData,
        revalidate: staticGenerationStore.revalidate ?? defaultRevalidate,
      }

      // provide bailout info for debugging
      if (extraRenderResultMeta.revalidate === 0) {
        extraRenderResultMeta.staticBailoutInfo = {
          description: staticGenerationStore.dynamicUsageDescription,
          stack: staticGenerationStore.dynamicUsageStack,
        }
      }

      return new RenderResult(htmlResult, { ...extraRenderResultMeta })
    }

    return renderResult
  }

  return RequestAsyncStorageWrapper.wrap(
    requestAsyncStorage,
    { req, res, renderOpts },
    () =>
      StaticGenerationAsyncStorageWrapper.wrap(
        staticGenerationAsyncStorage,
        { pathname, renderOpts },
        () => wrappedRender()
      )
  )
}
