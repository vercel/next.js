import type { IncomingMessage, ServerResponse } from 'http'
import type {
  ActionResult,
  ChildProp,
  DynamicParamTypesShort,
  FlightData,
  FlightDataPath,
  FlightRouterState,
  FlightSegmentPath,
  RenderOpts,
  Segment,
} from './types'

import type { StaticGenerationAsyncStorage } from '../../client/components/static-generation-async-storage.external'
import type { StaticGenerationBailout } from '../../client/components/static-generation-bailout'
import type { RequestAsyncStorage } from '../../client/components/request-async-storage.external'

import React from 'react'
import { createServerComponentRenderer } from './create-server-components-renderer'

import { NextParsedUrlQuery } from '../request-meta'
import RenderResult, { type RenderResultMetadata } from '../render-result'
import {
  renderToInitialFizzStream,
  createBufferedTransformStream,
  continueFizzStream,
  streamToBufferedResult,
  cloneTransformStream,
} from '../stream-utils/node-web-streams-helper'
import {
  canSegmentBeOverridden,
  matchSegment,
} from '../../client/components/match-segments'
import { stripInternalQueries } from '../internal-utils'
import {
  NEXT_ROUTER_PREFETCH,
  NEXT_ROUTER_STATE_TREE,
  RSC,
} from '../../client/components/app-router-headers'
import { createMetadataComponents } from '../../lib/metadata/metadata'
import { RequestAsyncStorageWrapper } from '../async-storage/request-async-storage-wrapper'
import { StaticGenerationAsyncStorageWrapper } from '../async-storage/static-generation-async-storage-wrapper'
import { isClientReference } from '../../lib/client-reference'
import { getLayoutOrPageModule, LoaderTree } from '../lib/app-dir-module'
import { isNotFoundError } from '../../client/components/not-found'
import {
  getURLFromRedirectError,
  isRedirectError,
} from '../../client/components/redirect'
import { getRedirectStatusCodeFromError } from '../../client/components/get-redirect-status-code-from-error'
import { addImplicitTags, patchFetch } from '../lib/patch-fetch'
import { AppRenderSpan } from '../lib/trace/constants'
import { getTracer } from '../lib/trace/tracer'
import { interopDefault } from './interop-default'
import { preloadComponent } from './preload-component'
import { FlightRenderResult } from './flight-render-result'
import { createErrorHandler } from './create-error-handler'
import {
  getShortDynamicParamType,
  dynamicParamTypes,
} from './get-short-dynamic-param-type'
import { getSegmentParam } from './get-segment-param'
import { getCssInlinedLinkTags } from './get-css-inlined-link-tags'
import { getPreloadableFonts } from './get-preloadable-fonts'
import { getScriptNonceFromHeader } from './get-script-nonce-from-header'
import { renderToString } from './render-to-string'
import { parseAndValidateFlightRouterState } from './parse-and-validate-flight-router-state'
import { validateURL } from './validate-url'
import {
  addSearchParamsIfPageSegment,
  createFlightRouterStateFromLoaderTree,
} from './create-flight-router-state-from-loader-tree'
import { handleAction } from './action-handler'
import { NEXT_DYNAMIC_NO_SSR_CODE } from '../../shared/lib/lazy-dynamic/no-ssr-error'
import { warn } from '../../build/output/log'
import { appendMutableCookies } from '../web/spec-extension/adapters/request-cookies'
import { createServerInsertedHTML } from './server-inserted-html'
import { getRequiredScripts } from './required-scripts'
import { addPathPrefix } from '../../shared/lib/router/utils/add-path-prefix'

export type GetDynamicParamFromSegment = (
  // [slug] / [[slug]] / [...slug]
  segment: string
) => {
  param: string
  value: string | string[] | null
  treeSegment: Segment
  type: DynamicParamTypesShort
} | null

function createNotFoundLoaderTree(loaderTree: LoaderTree): LoaderTree {
  // Align the segment with parallel-route-default in next-app-loader
  return ['', {}, loaderTree[2]]
}

/* This method is important for intercepted routes to function:
 * when a route is intercepted, e.g. /blog/[slug], it will be rendered
 * with the layout of the previous page, e.g. /profile/[id]. The problem is
 * that the loader tree needs to know the dynamic param in order to render (id and slug in the example).
 * Normally they are read from the path but since we are intercepting the route, the path would not contain id,
 * so we need to read it from the router state.
 */
function findDynamicParamFromRouterState(
  providedFlightRouterState: FlightRouterState | undefined,
  segment: string
): {
  param: string
  value: string | string[] | null
  treeSegment: Segment
  type: DynamicParamTypesShort
} | null {
  if (!providedFlightRouterState) {
    return null
  }

  const treeSegment = providedFlightRouterState[0]

  if (canSegmentBeOverridden(segment, treeSegment)) {
    if (!Array.isArray(treeSegment) || Array.isArray(segment)) {
      return null
    }

    return {
      param: treeSegment[0],
      value: treeSegment[1],
      treeSegment: treeSegment,
      type: treeSegment[2],
    }
  }

  for (const parallelRouterState of Object.values(
    providedFlightRouterState[1]
  )) {
    const maybeDynamicParam = findDynamicParamFromRouterState(
      parallelRouterState,
      segment
    )
    if (maybeDynamicParam) {
      return maybeDynamicParam
    }
  }

  return null
}

function hasLoadingComponentInTree(tree: LoaderTree): boolean {
  const [, parallelRoutes, { loading }] = tree

  if (loading) {
    return true
  }

  return Object.values(parallelRoutes).some((parallelRoute) =>
    hasLoadingComponentInTree(parallelRoute)
  ) as boolean
}

export type AppPageRender = (
  req: IncomingMessage,
  res: ServerResponse,
  pagePath: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts
) => Promise<RenderResult>

export const renderToHTMLOrFlight: AppPageRender = (
  req,
  res,
  pagePath,
  query,
  renderOpts
) => {
  const isFlight = req.headers[RSC.toLowerCase()] !== undefined
  const isNotFoundPath = pagePath === '/404'
  const pathname = validateURL(req.url)

  // A unique request timestamp used by development to ensure that it's
  // consistent and won't change during this request. This is important to
  // avoid that resources can be deduped by React Float if the same resource is
  // rendered or preloaded multiple times: `<link href="a.css?v={Date.now()}"/>`.
  const DEV_REQUEST_TS = Date.now()

  const {
    buildManifest,
    subresourceIntegrityManifest,
    serverActionsManifest,
    ComponentMod,
    dev,
    nextFontManifest,
    supportsDynamicHTML,
    nextConfigOutput,
    serverActionsBodySizeLimit,
    buildId,
    deploymentId,
    appDirDevErrorLogger,
  } = renderOpts

  // We need to expose the bundled `require` API globally for
  // react-server-dom-webpack. This is a hack until we find a better way.
  if (ComponentMod.__next_app__) {
    // @ts-ignore
    globalThis.__next_require__ = ComponentMod.__next_app__.require

    // @ts-ignore
    globalThis.__next_chunk_load__ = ComponentMod.__next_app__.loadChunk
  }

  const extraRenderResultMeta: RenderResultMetadata = {}

  const appUsingSizeAdjust = !!nextFontManifest?.appUsingSizeAdjust

  const clientReferenceManifest = renderOpts.clientReferenceManifest!

  const capturedErrors: Error[] = []
  const allCapturedErrors: Error[] = []
  const isNextExport = !!renderOpts.nextExport
  const serverComponentsErrorHandler = createErrorHandler({
    _source: 'serverComponentsRenderer',
    dev,
    isNextExport,
    errorLogger: appDirDevErrorLogger,
    capturedErrors,
  })
  const flightDataRendererErrorHandler = createErrorHandler({
    _source: 'flightDataRenderer',
    dev,
    isNextExport,
    errorLogger: appDirDevErrorLogger,
    capturedErrors,
  })
  const htmlRendererErrorHandler = createErrorHandler({
    _source: 'htmlRenderer',
    dev,
    isNextExport,
    errorLogger: appDirDevErrorLogger,
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
  const staticGenerationBailout: StaticGenerationBailout =
    ComponentMod.staticGenerationBailout

  // we wrap the render in an AsyncLocalStorage context
  const wrappedRender = async () => {
    const staticGenerationStore = staticGenerationAsyncStorage.getStore()
    if (!staticGenerationStore) {
      throw new Error(
        `Invariant: Render expects to have staticGenerationAsyncStorage, none found`
      )
    }

    staticGenerationStore.fetchMetrics = []
    extraRenderResultMeta.fetchMetrics = staticGenerationStore.fetchMetrics

    const requestStore = requestAsyncStorage.getStore()
    if (!requestStore) {
      throw new Error(
        `Invariant: Render expects to have requestAsyncStorage, none found`
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

    let requestId: string

    if (process.env.NEXT_RUNTIME === 'edge') {
      requestId = crypto.randomUUID()
    } else {
      requestId = require('next/dist/compiled/nanoid').nanoid()
    }

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
    const params = renderOpts.params ?? {}

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

      let value = params[key]

      // this is a special marker that will be present for interception routes
      if (value === '__NEXT_EMPTY_PARAM__') {
        value = undefined
      }

      if (Array.isArray(value)) {
        value = value.map((i) => encodeURIComponent(i))
      } else if (typeof value === 'string') {
        value = encodeURIComponent(value)
      }

      if (!value) {
        // Handle case where optional catchall does not have a value, e.g. `/dashboard/[...slug]` when requesting `/dashboard`
        if (segmentParam.type === 'optional-catchall') {
          const type = dynamicParamTypes[segmentParam.type]
          return {
            param: key,
            value: null,
            type: type,
            // This value always has to be a string.
            treeSegment: [key, '', type],
          }
        }
        return findDynamicParamFromRouterState(
          providedFlightRouterState,
          segment
        )
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

    let defaultRevalidate: false | undefined | number = false

    const assetPrefix = renderOpts.assetPrefix || ''

    const getAssetQueryString = (addTimestamp: boolean) => {
      const isDev = process.env.NODE_ENV === 'development'
      let qs = ''

      if (isDev && addTimestamp) {
        qs += `?v=${DEV_REQUEST_TS}`
      }

      if (deploymentId) {
        qs += `${isDev ? '&' : '?'}dpl=${deploymentId}`
      }
      return qs
    }

    const createComponentAndStyles = async ({
      filePath,
      getComponent,
      injectedCSS,
    }: {
      filePath: string
      getComponent: () => any
      injectedCSS: Set<string>
    }): Promise<any> => {
      const cssHrefs = getCssInlinedLinkTags(
        clientReferenceManifest,
        filePath,
        injectedCSS
      )

      const styles = cssHrefs
        ? cssHrefs.map((href, index) => {
            // In dev, Safari and Firefox will cache the resource during HMR:
            // - https://github.com/vercel/next.js/issues/5860
            // - https://bugs.webkit.org/show_bug.cgi?id=187726
            // Because of this, we add a `?v=` query to bypass the cache during
            // development. We need to also make sure that the number is always
            // increasing.
            const fullHref = `${assetPrefix}/_next/${href}${getAssetQueryString(
              true
            )}`

            // `Precedence` is an opt-in signal for React to handle resource
            // loading and deduplication, etc. It's also used as the key to sort
            // resources so they will be injected in the correct order.
            // During HMR, it's critical to use different `precedence` values
            // for different stylesheets, so their order will be kept.
            // https://github.com/facebook/react/pull/25060
            const precedence =
              process.env.NODE_ENV === 'development' ? 'next_' + href : 'next'

            return (
              <link
                rel="stylesheet"
                href={fullHref}
                // @ts-ignore
                precedence={precedence}
                crossOrigin={renderOpts.crossOrigin}
                key={index}
              />
            )
          })
        : null

      const Comp = interopDefault(await getComponent())

      return [Comp, styles]
    }

    const getLayerAssets = ({
      layoutOrPagePath,
      injectedCSS: injectedCSSWithCurrentLayout,
      injectedFontPreloadTags: injectedFontPreloadTagsWithCurrentLayout,
    }: {
      layoutOrPagePath: string | undefined
      injectedCSS: Set<string>
      injectedFontPreloadTags: Set<string>
    }): React.ReactNode => {
      const stylesheets: string[] = layoutOrPagePath
        ? getCssInlinedLinkTags(
            clientReferenceManifest,
            layoutOrPagePath,
            injectedCSSWithCurrentLayout,
            true
          )
        : []

      const preloadedFontFiles = layoutOrPagePath
        ? getPreloadableFonts(
            nextFontManifest,
            layoutOrPagePath,
            injectedFontPreloadTagsWithCurrentLayout
          )
        : null

      if (preloadedFontFiles) {
        if (preloadedFontFiles.length) {
          for (let i = 0; i < preloadedFontFiles.length; i++) {
            const fontFilename = preloadedFontFiles[i]
            const ext = /\.(woff|woff2|eot|ttf|otf)$/.exec(fontFilename)![1]
            const type = `font/${ext}`
            const href = `${assetPrefix}/_next/${fontFilename}`
            ComponentMod.preloadFont(href, type, renderOpts.crossOrigin)
          }
        } else {
          try {
            let url = new URL(assetPrefix)
            ComponentMod.preconnect(url.origin, 'anonymous')
          } catch (error) {
            // assetPrefix must not be a fully qualified domain name. We assume
            // we should preconnect to same origin instead
            ComponentMod.preconnect('/', 'anonymous')
          }
        }
      }

      const styles = stylesheets
        ? stylesheets.map((href, index) => {
            // In dev, Safari and Firefox will cache the resource during HMR:
            // - https://github.com/vercel/next.js/issues/5860
            // - https://bugs.webkit.org/show_bug.cgi?id=187726
            // Because of this, we add a `?v=` query to bypass the cache during
            // development. We need to also make sure that the number is always
            // increasing.
            const fullHref = `${assetPrefix}/_next/${href}${getAssetQueryString(
              true
            )}`

            // `Precedence` is an opt-in signal for React to handle resource
            // loading and deduplication, etc. It's also used as the key to sort
            // resources so they will be injected in the correct order.
            // During HMR, it's critical to use different `precedence` values
            // for different stylesheets, so their order will be kept.
            // https://github.com/facebook/react/pull/25060
            const precedence =
              process.env.NODE_ENV === 'development' ? 'next_' + href : 'next'

            ComponentMod.preloadStyle(fullHref, renderOpts.crossOrigin)

            return (
              <link
                rel="stylesheet"
                href={fullHref}
                // @ts-ignore
                precedence={precedence}
                crossOrigin={renderOpts.crossOrigin}
                key={index}
              />
            )
          })
        : null

      return styles
    }

    const parseLoaderTree = (tree: LoaderTree) => {
      const [segment, parallelRoutes, components] = tree
      const { layout } = components
      let { page } = components
      // a __DEFAULT__ segment means that this route didn't match any of the
      // segments in the route, so we should use the default page

      page = segment === '__DEFAULT__' ? components.defaultPage : page

      const layoutOrPagePath = layout?.[1] || page?.[1]

      return {
        page,
        segment,
        components,
        layoutOrPagePath,
        parallelRoutes,
      }
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
      metadataOutlet,
    }: {
      createSegmentPath: CreateSegmentPath
      loaderTree: LoaderTree
      parentParams: { [key: string]: any }
      rootLayoutIncluded: boolean
      firstItem?: boolean
      injectedCSS: Set<string>
      injectedFontPreloadTags: Set<string>
      asNotFound?: boolean
      metadataOutlet?: React.ReactNode
    }): Promise<{
      Component: React.ComponentType
      styles: React.ReactNode
    }> => {
      const { page, layoutOrPagePath, segment, components, parallelRoutes } =
        parseLoaderTree(tree)

      const {
        layout,
        template,
        error,
        loading,
        'not-found': notFound,
      } = components

      const injectedCSSWithCurrentLayout = new Set(injectedCSS)
      const injectedFontPreloadTagsWithCurrentLayout = new Set(
        injectedFontPreloadTags
      )

      const styles = getLayerAssets({
        layoutOrPagePath,
        injectedCSS: injectedCSSWithCurrentLayout,
        injectedFontPreloadTags: injectedFontPreloadTagsWithCurrentLayout,
      })

      const [Template, templateStyles] = template
        ? await createComponentAndStyles({
            filePath: template[1],
            getComponent: template[0],
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
        defaultRevalidate = layoutOrPageMod.revalidate as number

        if (
          typeof staticGenerationStore.revalidate === 'undefined' ||
          (typeof staticGenerationStore.revalidate === 'number' &&
            staticGenerationStore.revalidate > defaultRevalidate)
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

      if (staticGenerationStore?.dynamicUsageErr) {
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
        const NotFoundBoundary =
          ComponentMod.NotFoundBoundary as typeof import('../../client/components/not-found-boundary').NotFoundBoundary
        Component = (componentProps: any) => {
          const NotFoundComponent = NotFound
          const RootLayoutComponent = LayoutOrPage
          return (
            <NotFoundBoundary
              notFound={
                <>
                  {styles}
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

      if (dev) {
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
                  // TODO-APP: Add test for loading returning `undefined`. This currently can't be tested as the `webdriver()` tab will wait for the full page to load before returning.
                  hasLoading={Boolean(Loading)}
                  error={ErrorComponent}
                  errorStyles={errorStyles}
                  template={
                    <Template>
                      <RenderFromTemplateContext />
                    </Template>
                  }
                  templateStyles={templateStyles}
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
              const {
                Component: ChildComponent,
                styles: childComponentStyles,
              } = await createComponentTree({
                createSegmentPath: (child) => {
                  return createSegmentPath([...currentSegmentPath, ...child])
                },
                loaderTree: parallelRoute,
                parentParams: currentParams,
                rootLayoutIncluded: rootLayoutIncludedAtThisLevelOrAbove,
                injectedCSS: injectedCSSWithCurrentLayout,
                injectedFontPreloadTags:
                  injectedFontPreloadTagsWithCurrentLayout,
                asNotFound,
                metadataOutlet,
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
          styles,
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
              {isPage ? metadataOutlet : null}
              {/* <Component /> needs to be the first element because we use `findDOMNode` in layout router to locate it. */}
              {isPage && isClientComponent ? (
                <StaticGenerationSearchParamsBailoutProvider
                  propsForComponent={props}
                  Component={Component}
                  isStaticGeneration={isStaticGeneration}
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
        styles,
      }
    }

    // Handle Flight render request. This is only used when client-side navigating. E.g. when you `router.push('/dashboard')` or `router.reload()`.
    const generateFlight = async (options?: {
      actionResult: ActionResult
      skipFlight: boolean
      asNotFound?: boolean
    }): Promise<RenderResult> => {
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
        asNotFound,
        metadataOutlet,
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
        asNotFound?: boolean
        metadataOutlet: React.ReactNode
      }): Promise<FlightDataPath[]> => {
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
              : null

          return [
            [
              overriddenSegment ?? actualSegment,
              createFlightRouterStateFromLoaderTree(
                // Create router state using the slice of the loaderTree
                loaderTreeToFilter,
                getDynamicParamFromSegment,
                query
              ),
              shouldSkipComponentTree
                ? null
                : // Create component tree using the slice of the loaderTree
                  // @ts-expect-error TODO-APP: fix async component type
                  React.createElement(async () => {
                    const { Component } = await createComponentTree(
                      // This ensures flightRouterPath is valid and filters down the tree
                      {
                        createSegmentPath,
                        loaderTree: loaderTreeToFilter,
                        parentParams: currentParams,
                        firstItem: isFirst,
                        injectedCSS,
                        injectedFontPreloadTags,
                        // This is intentionally not "rootLayoutIncludedAtThisLevelOrAbove" as createComponentTree starts at the current level and does a check for "rootLayoutAtThisLevel" too.
                        rootLayoutIncluded,
                        asNotFound,
                        metadataOutlet,
                      }
                    )

                    return <Component />
                  }),
              shouldSkipComponentTree
                ? null
                : (() => {
                    const { layoutOrPagePath } =
                      parseLoaderTree(loaderTreeToFilter)

                    const styles = getLayerAssets({
                      layoutOrPagePath,
                      injectedCSS: new Set(injectedCSS),
                      injectedFontPreloadTags: new Set(injectedFontPreloadTags),
                    })

                    return (
                      <>
                        {styles}
                        {rscPayloadHead}
                      </>
                    )
                  })(),
            ],
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
            layoutPath,
            injectedCSSWithCurrentLayout,
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
                injectedFontPreloadTags:
                  injectedFontPreloadTagsWithCurrentLayout,
                rootLayoutIncluded: rootLayoutIncludedAtThisLevelOrAbove,
                asNotFound,
                metadataOutlet,
              })

              return path
                .map((item) => {
                  // we don't need to send over default routes in the flight data
                  // because they are always ignored by the client, unless it's a refetch
                  if (
                    item[0] === '__DEFAULT__' &&
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

      // Flight data that is going to be passed to the browser.
      // Currently a single item array but in the future multiple patches might be combined in a single request.

      let flightData: FlightData | null = null
      if (!options?.skipFlight) {
        const [MetadataTree, MetadataOutlet] = createMetadataComponents({
          tree: loaderTree,
          pathname,
          searchParams: providedSearchParams,
          getDynamicParamFromSegment,
          appUsingSizeAdjust,
        })
        flightData = (
          await walkTreeWithFlightRouterState({
            createSegmentPath: (child) => child,
            loaderTreeToFilter: loaderTree,
            parentParams: {},
            flightRouterState: providedFlightRouterState,
            isFirst: true,
            // For flight, render metadata inside leaf page
            rscPayloadHead: (
              // Adding requestId as react key to make metadata remount for each render
              <MetadataTree key={requestId} />
            ),
            injectedCSS: new Set(),
            injectedFontPreloadTags: new Set(),
            rootLayoutIncluded: false,
            asNotFound: isNotFoundPath || options?.asNotFound,
            metadataOutlet: <MetadataOutlet />,
          })
        ).map((path) => path.slice(1)) // remove the '' (root) segment
      }

      const buildIdFlightDataPair = [buildId, flightData]

      // For app dir, use the bundled version of Flight server renderer (renderToReadableStream)
      // which contains the subset React.
      const flightReadableStream = ComponentMod.renderToReadableStream(
        options
          ? [options.actionResult, buildIdFlightDataPair]
          : buildIdFlightDataPair,
        clientReferenceManifest.clientModules,
        {
          context: serverContexts,
          onError: flightDataRendererErrorHandler,
        }
      ).pipeThrough(createBufferedTransformStream())

      return new FlightRenderResult(flightReadableStream)
    }

    if (isFlight && !staticGenerationStore.isStaticGeneration) {
      return generateFlight()
    }

    // Below this line is handling for rendering to HTML.

    // AppRouter is provided by next-app-loader
    const AppRouter =
      ComponentMod.AppRouter as typeof import('../../client/components/app-router').default

    const GlobalError =
      /** GlobalError can be either the default error boundary or the overwritten app/global-error.js **/
      ComponentMod.GlobalError as typeof import('../../client/components/error-boundary').GlobalError

    // Get the nonce from the incoming request if it has one.
    const csp = req.headers['content-security-policy']
    let nonce: string | undefined
    if (csp && typeof csp === 'string') {
      nonce = getScriptNonceFromHeader(csp)
    }

    const serverComponentsRenderOpts = {
      inlinedDataTransformStream: new TransformStream<Uint8Array, Uint8Array>(),
      clientReferenceManifest,
      serverContexts,
      formState: null,
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

    /**
     * A new React Component that renders the provided React Component
     * using Flight which can then be rendered to HTML.
     */
    const createServerComponentsRenderer = (
      loaderTreeToRender: LoaderTree,
      preinitScripts: () => void,
      formState: null | any
    ) =>
      createServerComponentRenderer<{
        asNotFound: boolean
      }>(
        async (props) => {
          preinitScripts()
          // Create full component tree from root to leaf.
          const injectedCSS = new Set<string>()
          const injectedFontPreloadTags = new Set<string>()
          const initialTree = createFlightRouterStateFromLoaderTree(
            loaderTreeToRender,
            getDynamicParamFromSegment,
            query
          )

          const [MetadataTree, MetadataOutlet] = createMetadataComponents({
            tree: loaderTreeToRender,
            errorType: props.asNotFound ? 'not-found' : undefined,
            pathname,
            searchParams: providedSearchParams,
            getDynamicParamFromSegment: getDynamicParamFromSegment,
            appUsingSizeAdjust: appUsingSizeAdjust,
          })

          const { Component: ComponentTree, styles } =
            await createComponentTree({
              createSegmentPath: (child) => child,
              loaderTree: loaderTreeToRender,
              parentParams: {},
              firstItem: true,
              injectedCSS,
              injectedFontPreloadTags,
              rootLayoutIncluded: false,
              asNotFound: props.asNotFound,
              metadataOutlet: <MetadataOutlet />,
            })

          return (
            <>
              {styles}
              <AppRouter
                buildId={buildId}
                assetPrefix={assetPrefix}
                initialCanonicalUrl={pathname}
                initialTree={initialTree}
                initialHead={
                  <>
                    {res.statusCode > 400 && (
                      <meta name="robots" content="noindex" />
                    )}
                    {/* Adding requestId as react key to make metadata remount for each render */}
                    <MetadataTree key={requestId} />
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
        { ...serverComponentsRenderOpts, formState },
        serverComponentsErrorHandler,
        nonce
      )

    const { HeadManagerContext } =
      require('../../shared/lib/head-manager-context.shared-runtime') as typeof import('../../shared/lib/head-manager-context.shared-runtime')

    // On each render, create a new `ServerInsertedHTML` context to capture
    // injected nodes from user code (`useServerInsertedHTML`).
    const { ServerInsertedHTMLProvider, renderServerInsertedHTML } =
      createServerInsertedHTML()

    getTracer().getRootSpanAttributes()?.set('next.route', pagePath)
    const bodyResult = getTracer().wrap(
      AppRenderSpan.getBodyResult,
      {
        spanName: `render route (app) ${pagePath}`,
        attributes: {
          'next.route': pagePath,
        },
      },
      async ({
        asNotFound,
        tree,
        formState,
      }: {
        /**
         * This option is used to indicate that the page should be rendered as
         * if it was not found. When it's enabled, instead of rendering the
         * page component, it renders the not-found segment.
         *
         */
        asNotFound: boolean
        tree: LoaderTree
        formState: any
      }) => {
        const polyfills: JSX.IntrinsicElements['script'][] =
          buildManifest.polyfillFiles
            .filter(
              (polyfill) =>
                polyfill.endsWith('.js') && !polyfill.endsWith('.module.js')
            )
            .map((polyfill) => ({
              src: `${assetPrefix}/_next/${polyfill}${getAssetQueryString(
                false
              )}`,
              integrity: subresourceIntegrityManifest?.[polyfill],
              crossOrigin: renderOpts.crossOrigin,
              noModule: true,
              nonce,
            }))

        const [preinitScripts, bootstrapScript] = getRequiredScripts(
          buildManifest,
          assetPrefix,
          renderOpts.crossOrigin,
          subresourceIntegrityManifest,
          getAssetQueryString(true),
          nonce
        )
        const ServerComponentsRenderer = createServerComponentsRenderer(
          tree,
          preinitScripts,
          formState
        )
        const content = (
          <HeadManagerContext.Provider
            value={{
              appDir: true,
              nonce,
            }}
          >
            <ServerInsertedHTMLProvider>
              <ServerComponentsRenderer asNotFound={asNotFound} />
            </ServerInsertedHTMLProvider>
          </HeadManagerContext.Provider>
        )

        let polyfillsFlushed = false
        let flushedErrorMetaTagsUntilIndex = 0
        const getServerInsertedHTML = (serverCapturedErrors: Error[]) => {
          // Loop through all the errors that have been captured but not yet
          // flushed.
          const errorMetaTags = []
          for (
            ;
            flushedErrorMetaTagsUntilIndex < serverCapturedErrors.length;
            flushedErrorMetaTagsUntilIndex++
          ) {
            const error = serverCapturedErrors[flushedErrorMetaTagsUntilIndex]

            if (isNotFoundError(error)) {
              errorMetaTags.push(
                <meta name="robots" content="noindex" key={error.digest} />,
                process.env.NODE_ENV === 'development' ? (
                  <meta
                    name="next-error"
                    content="not-found"
                    key="next-error"
                  />
                ) : null
              )
            } else if (isRedirectError(error)) {
              const redirectUrl = getURLFromRedirectError(error)
              const isPermanent =
                getRedirectStatusCodeFromError(error) === 308 ? true : false
              if (redirectUrl) {
                errorMetaTags.push(
                  <meta
                    httpEquiv="refresh"
                    content={`${isPermanent ? 0 : 1};url=${redirectUrl}`}
                    key={error.digest}
                  />
                )
              }
            }
          }

          const flushed = renderToString({
            ReactDOMServer: require('react-dom/server.edge'),
            element: (
              <>
                {polyfillsFlushed
                  ? null
                  : polyfills?.map((polyfill) => {
                      return <script key={polyfill.src} {...polyfill} />
                    })}
                {renderServerInsertedHTML()}
                {errorMetaTags}
              </>
            ),
          })
          polyfillsFlushed = true
          return flushed
        }

        try {
          const fizzStream = await renderToInitialFizzStream({
            ReactDOMServer: require('react-dom/server.edge'),
            element: content,
            streamOptions: {
              onError: htmlRendererErrorHandler,
              nonce,
              // Include hydration scripts in the HTML
              bootstrapScripts: [bootstrapScript],
              experimental_formState: formState,
            },
          })

          const result = await continueFizzStream(fizzStream, {
            inlinedDataStream:
              serverComponentsRenderOpts.inlinedDataTransformStream.readable,
            generateStaticHTML:
              staticGenerationStore.isStaticGeneration || generateStaticHTML,
            getServerInsertedHTML: () =>
              getServerInsertedHTML(allCapturedErrors),
            serverInsertedHTMLToHead: true,
            ...validateRootLayout,
          })

          return result
        } catch (err: any) {
          if (
            err.code === 'NEXT_STATIC_GEN_BAILOUT' ||
            err.message?.includes(
              'https://nextjs.org/docs/advanced-features/static-html-export'
            )
          ) {
            // Ensure that "next dev" prints the red error overlay
            throw err
          }
          if (err.digest === NEXT_DYNAMIC_NO_SSR_CODE) {
            warn(
              `Entire page ${pagePath} deopted into client-side rendering. https://nextjs.org/docs/messages/deopted-into-client-rendering`,
              pagePath
            )
          }

          if (isNotFoundError(err)) {
            res.statusCode = 404
          }
          let hasRedirectError = false
          if (isRedirectError(err)) {
            hasRedirectError = true
            res.statusCode = getRedirectStatusCodeFromError(err)
            if (err.mutableCookies) {
              const headers = new Headers()

              // If there were mutable cookies set, we need to set them on the
              // response.
              if (appendMutableCookies(headers, err.mutableCookies)) {
                res.setHeader('set-cookie', Array.from(headers.values()))
              }
            }
            const redirectUrl = addPathPrefix(
              getURLFromRedirectError(err),
              renderOpts.basePath
            )
            res.setHeader('Location', redirectUrl)
          }

          const is404 = res.statusCode === 404

          // Preserve the existing RSC inline chunks from the page rendering.
          // To avoid the same stream being operated twice, clone the origin stream for error rendering.
          const serverErrorComponentsRenderOpts: typeof serverComponentsRenderOpts =
            {
              ...serverComponentsRenderOpts,
              inlinedDataTransformStream: cloneTransformStream(
                serverComponentsRenderOpts.inlinedDataTransformStream
              ),
              formState,
            }

          const errorType = is404
            ? 'not-found'
            : hasRedirectError
            ? 'redirect'
            : undefined

          const errorMeta = (
            <>
              {res.statusCode >= 400 && (
                <meta name="robots" content="noindex" />
              )}
              {process.env.NODE_ENV === 'development' && (
                <meta name="next-error" content="not-found" />
              )}
            </>
          )

          const [errorPreinitScripts, errorBootstrapScript] =
            getRequiredScripts(
              buildManifest,
              assetPrefix,
              renderOpts.crossOrigin,
              subresourceIntegrityManifest,
              getAssetQueryString(false),
              nonce
            )

          const ErrorPage = createServerComponentRenderer(
            async () => {
              errorPreinitScripts()
              const [MetadataTree] = createMetadataComponents({
                tree,
                pathname,
                errorType,
                searchParams: providedSearchParams,
                getDynamicParamFromSegment,
                appUsingSizeAdjust,
              })

              const head = (
                <>
                  {/* Adding requestId as react key to make metadata remount for each render */}
                  <MetadataTree key={requestId} />
                  {errorMeta}
                </>
              )

              const initialTree = createFlightRouterStateFromLoaderTree(
                tree,
                getDynamicParamFromSegment,
                query
              )

              // For metadata notFound error there's no global not found boundary on top
              // so we create a not found page with AppRouter
              return (
                <AppRouter
                  buildId={buildId}
                  assetPrefix={assetPrefix}
                  initialCanonicalUrl={pathname}
                  initialTree={initialTree}
                  initialHead={head}
                  globalErrorComponent={GlobalError}
                >
                  <html id="__next_error__">
                    <head></head>
                    <body></body>
                  </html>
                </AppRouter>
              )
            },
            ComponentMod,
            serverErrorComponentsRenderOpts,
            serverComponentsErrorHandler,
            nonce
          )

          try {
            const fizzStream = await renderToInitialFizzStream({
              ReactDOMServer: require('react-dom/server.edge'),
              element: <ErrorPage />,
              streamOptions: {
                nonce,
                // Include hydration scripts in the HTML
                bootstrapScripts: [errorBootstrapScript],
                experimental_formState: formState,
              },
            })

            return await continueFizzStream(fizzStream, {
              inlinedDataStream:
                serverErrorComponentsRenderOpts.inlinedDataTransformStream
                  .readable,
              generateStaticHTML: staticGenerationStore.isStaticGeneration,
              getServerInsertedHTML: () => getServerInsertedHTML([]),
              serverInsertedHTMLToHead: true,
              ...validateRootLayout,
            })
          } catch (finalErr: any) {
            if (
              process.env.NODE_ENV === 'development' &&
              isNotFoundError(finalErr)
            ) {
              const bailOnNotFound: typeof import('../../client/components/dev-root-not-found-boundary').bailOnNotFound =
                require('../../client/components/dev-root-not-found-boundary').bailOnNotFound
              bailOnNotFound()
            }
            throw finalErr
          }
        }
      }
    )

    // For action requests, we handle them differently with a special render result.
    const actionRequestResult = await handleAction({
      req,
      res,
      ComponentMod,
      page: renderOpts.page,
      serverActionsManifest,
      generateFlight,
      staticGenerationStore,
      requestStore,
      serverActionsBodySizeLimit,
    })

    let formState: null | any = null
    if (actionRequestResult) {
      if (actionRequestResult.type === 'not-found') {
        const notFoundLoaderTree = createNotFoundLoaderTree(loaderTree)
        return new RenderResult(
          await bodyResult({
            asNotFound: true,
            tree: notFoundLoaderTree,
            formState,
          }),
          { ...extraRenderResultMeta }
        )
      } else if (actionRequestResult.type === 'done') {
        if (actionRequestResult.result) {
          actionRequestResult.result.extendMetadata(extraRenderResultMeta)
          return actionRequestResult.result
        } else if (actionRequestResult.formState) {
          formState = actionRequestResult.formState
        }
      }
    }

    const renderResult = new RenderResult(
      await bodyResult({
        asNotFound: isNotFoundPath,
        tree: loaderTree,
        formState,
      }),
      {
        ...extraRenderResultMeta,
        waitUntil: Promise.all(staticGenerationStore.pendingRevalidates || []),
      }
    )

    addImplicitTags(staticGenerationStore)
    extraRenderResultMeta.fetchTags = staticGenerationStore.tags?.join(',')
    renderResult.extendMetadata({
      fetchTags: extraRenderResultMeta.fetchTags,
    })

    if (staticGenerationStore.isStaticGeneration) {
      const htmlResult = await streamToBufferedResult(renderResult)

      // if we encountered any unexpected errors during build
      // we fail the prerendering phase and the build
      if (capturedErrors.length > 0) {
        throw capturedErrors[0]
      }

      // TODO-APP: derive this from same pass to prevent additional
      // render during static generation
      const stringifiedFlightPayload = await streamToBufferedResult(
        await generateFlight()
      )

      if (staticGenerationStore.forceStatic === false) {
        staticGenerationStore.revalidate = 0
      }

      extraRenderResultMeta.pageData = stringifiedFlightPayload
      extraRenderResultMeta.revalidate =
        staticGenerationStore.revalidate ?? defaultRevalidate

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
        { urlPathname: pathname, renderOpts },
        () => wrappedRender()
      )
  )
}
