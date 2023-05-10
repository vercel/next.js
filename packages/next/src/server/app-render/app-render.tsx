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

import type { StaticGenerationAsyncStorage } from '../../client/components/static-generation-async-storage'
import type { StaticGenerationBailout } from '../../client/components/static-generation-bailout'
import type { RequestAsyncStorage } from '../../client/components/request-async-storage'

import React from 'react'
import { NotFound as DefaultNotFound } from '../../client/components/error'
import { createServerComponentRenderer } from './create-server-components-renderer'

import { ParsedUrlQuery } from 'querystring'
import { NextParsedUrlQuery } from '../request-meta'
import RenderResult, { type RenderResultMetadata } from '../render-result'
import {
  renderToInitialStream,
  createBufferedTransformStream,
  continueFromInitialStream,
  streamToBufferedResult,
} from '../stream-utils/node-web-streams-helper'
import {
  canSegmentBeOverridden,
  matchSegment,
} from '../../client/components/match-segments'
import { ServerInsertedHTMLContext } from '../../shared/lib/server-inserted-html'
import { stripInternalQueries } from '../internal-utils'
import {
  NEXT_ROUTER_PREFETCH,
  NEXT_ROUTER_STATE_TREE,
  RSC,
} from '../../client/components/app-router-headers'
import { MetadataTree } from '../../lib/metadata/metadata'
import { RequestAsyncStorageWrapper } from '../async-storage/request-async-storage-wrapper'
import { StaticGenerationAsyncStorageWrapper } from '../async-storage/static-generation-async-storage-wrapper'
import { isClientReference } from '../../lib/client-reference'
import { getLayoutOrPageModule, LoaderTree } from '../lib/app-dir-module'
import { isNotFoundError } from '../../client/components/not-found'
import {
  getURLFromRedirectError,
  isRedirectError,
} from '../../client/components/redirect'
import { addImplicitTags, patchFetch } from '../lib/patch-fetch'
import { AppRenderSpan } from '../lib/trace/constants'
import { getTracer } from '../lib/trace/tracer'
import { interopDefault } from './interop-default'
import { preloadComponent } from './preload-component'
import { FlightRenderResult } from './flight-render-result'
import { createErrorHandler } from './create-error-handler'
import { getShortDynamicParamType } from './get-short-dynamic-param-type'
import { getSegmentParam } from './get-segment-param'
import { getCssInlinedLinkTags } from './get-css-inlined-link-tags'
import { getServerCSSForEntries } from './get-server-css-for-entries'
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

export async function renderToHTMLOrFlight(
  req: IncomingMessage,
  res: ServerResponse,
  pagePath: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts
): Promise<RenderResult> {
  const isFlight = req.headers[RSC.toLowerCase()] !== undefined
  const pathname = validateURL(req.url)

  const {
    buildManifest,
    subresourceIntegrityManifest,
    serverActionsManifest,
    ComponentMod,
    dev,
    nextFontManifest,
    supportsDynamicHTML,
    nextConfigOutput,
  } = renderOpts

  const appUsingSizeAdjust = nextFontManifest?.appUsingSizeAdjust

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
    ;(renderOpts as any).fetchMetrics = staticGenerationStore.fetchMetrics

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
          const type = getShortDynamicParamType(segmentParam.type)
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
        ? cssHrefs.map((href, index) => {
            // In dev, Safari and Firefox will cache the resource during HMR:
            // - https://github.com/vercel/next.js/issues/5860
            // - https://bugs.webkit.org/show_bug.cgi?id=187726
            // Because of this, we add a `?v=` query to bypass the cache during
            // development. We need to also make sure that the number is always
            // increasing.
            const fullHref = `${assetPrefix}/_next/${href}${
              process.env.NODE_ENV === 'development' ? `?v=${Date.now()}` : ''
            }`

            // `Precedence` is an opt-in signal for React to handle resource
            // loading and deduplication, etc. It's also used as the key to sort
            // resources so they will be injected in the correct order.
            // During HMR, it's critical to use different `precedence` values
            // for different stylesheets, so their order will be kept.
            // https://github.com/facebook/react/pull/25060
            const precedence = shouldPreload
              ? process.env.NODE_ENV === 'development'
                ? 'next_' + href
                : 'next'
              : undefined

            return (
              <link
                rel="stylesheet"
                href={fullHref}
                // @ts-ignore
                precedence={precedence}
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
            serverCSSManifest!,
            layoutOrPagePath,
            serverCSSForEntries,
            injectedCSSWithCurrentLayout,
            true
          )
        : []

      const preloadedFontFiles = layoutOrPagePath
        ? getPreloadableFonts(
            serverCSSManifest!,
            nextFontManifest,
            serverCSSForEntries,
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
            ComponentMod.preloadFont(href, type)
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
            const fullHref = `${assetPrefix}/_next/${href}${
              process.env.NODE_ENV === 'development' ? `?v=${Date.now()}` : ''
            }`

            // `Precedence` is an opt-in signal for React to handle resource
            // loading and deduplication, etc. It's also used as the key to sort
            // resources so they will be injected in the correct order.
            // During HMR, it's critical to use different `precedence` values
            // for different stylesheets, so their order will be kept.
            // https://github.com/facebook/react/pull/25060
            const precedence =
              process.env.NODE_ENV === 'development' ? 'next_' + href : 'next'

            ComponentMod.preloadStyle(fullHref)

            return (
              <link
                rel="stylesheet"
                href={fullHref}
                // @ts-ignore
                precedence={precedence}
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
    }: {
      createSegmentPath: CreateSegmentPath
      loaderTree: LoaderTree
      parentParams: { [key: string]: any }
      rootLayoutIncluded: boolean
      firstItem?: boolean
      injectedCSS: Set<string>
      injectedFontPreloadTags: Set<string>
      asNotFound?: boolean
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
            `The default export is not a React Component in page: "${page}"`
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
            const currentSegmentPath: FlightSegmentPath = firstItem
              ? [parallelRouteKey]
              : [actualSegment, parallelRouteKey]

            const parallelRoute = parallelRoutes[parallelRouteKey]
            const childSegment = parallelRoute[0]
            const childSegmentParam = getDynamicParamFromSegment(childSegment)

            // if we're prefetching and that there's a Loading component, we bail out
            // otherwise we keep rendering for the prefetch
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
            const { Component: ChildComponent, styles: childStyles } =
              await createComponentTree({
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
                styles={childStyles}
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
          styles,
        }
      }

      const isClientComponent = isClientReference(layoutOrPageMod)

      // If it's a not found route, and we don't have any matched parallel
      // routes, we try to render the not found component if it exists.
      let notFoundComponent = {}
      if (asNotFound && !parallelRouteMap.length && NotFound) {
        notFoundComponent = {
          children: (
            <>
              <meta name="robots" content="noindex" />
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
              {/* <Component /> needs to be the first element because we use `findDOMNode` in layout router to locate it. */}
              {isPage && isClientComponent && isStaticGeneration ? (
                <StaticGenerationSearchParamsBailoutProvider
                  propsForComponent={props}
                  Component={Component}
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
              // Create component tree using the slice of the loaderTree
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
                  }
                )

                return <Component />
              }),
              (() => {
                const { layoutOrPagePath } = parseLoaderTree(loaderTreeToFilter)

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
            serverCSSManifest!,
            layoutPath,
            serverCSSForEntries,
            injectedCSSWithCurrentLayout,
            true
          )
          getPreloadableFonts(
            serverCSSManifest!,
            nextFontManifest,
            serverCSSForEntries,
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
      const flightData: FlightData | null = options?.skipFlight
        ? null
        : (
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
                  <MetadataTree
                    key={requestId}
                    tree={loaderTree}
                    pathname={pathname}
                    searchParams={providedSearchParams}
                    getDynamicParamFromSegment={getDynamicParamFromSegment}
                  />
                  {appUsingSizeAdjust ? <meta name="next-size-adjust" /> : null}
                </>
              ),
              injectedCSS: new Set(),
              injectedFontPreloadTags: new Set(),
              rootLayoutIncluded: false,
              asNotFound: pagePath === '/404' || options?.asNotFound,
            })
          ).map((path) => path.slice(1)) // remove the '' (root) segment

      // For app dir, use the bundled version of Fizz renderer (renderToReadableStream)
      // which contains the subset React.
      const readable = ComponentMod.renderToReadableStream(
        options ? [options.actionResult, flightData] : flightData,
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

    const GlobalError =
      /** GlobalError can be either the default error boundary or the overwritten app/global-error.js **/
      ComponentMod.GlobalError as typeof import('../../client/components/error-boundary').default

    let serverComponentsInlinedTransformStream: TransformStream<
      Uint8Array,
      Uint8Array
    > = new TransformStream()

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

    /**
     * A new React Component that renders the provided React Component
     * using Flight which can then be rendered to HTML.
     */
    const ServerComponentsRenderer = createServerComponentRenderer<{
      asNotFound: boolean
    }>(
      async (props) => {
        // Create full component tree from root to leaf.
        const injectedCSS = new Set<string>()
        const injectedFontPreloadTags = new Set<string>()

        const { Component: ComponentTree, styles } = await createComponentTree({
          createSegmentPath: (child) => child,
          loaderTree,
          parentParams: {},
          firstItem: true,
          injectedCSS,
          injectedFontPreloadTags,
          rootLayoutIncluded: false,
          asNotFound: props.asNotFound,
        })

        const { 'not-found': notFound, layout } = loaderTree[2]
        const isLayout = typeof layout !== 'undefined'
        const rootLayoutModule = layout?.[0]
        const RootLayout = rootLayoutModule
          ? interopDefault(await rootLayoutModule())
          : null
        const rootLayoutAtThisLevel = isLayout
        const [NotFound, notFoundStyles] = notFound
          ? await createComponentAndStyles({
              filePath: notFound[1],
              getComponent: notFound[0],
              injectedCSS,
            })
          : rootLayoutAtThisLevel
          ? [DefaultNotFound]
          : []

        const initialTree = createFlightRouterStateFromLoaderTree(
          loaderTree,
          getDynamicParamFromSegment,
          query
        )

        return (
          <>
            {styles}
            <AppRouter
              assetPrefix={assetPrefix}
              initialCanonicalUrl={pathname}
              initialTree={initialTree}
              initialHead={
                <>
                  {/* Adding key={requestId} to make metadata remount for each render */}
                  {/* @ts-expect-error allow to use async server component */}
                  <MetadataTree
                    key={requestId}
                    tree={loaderTree}
                    pathname={pathname}
                    searchParams={providedSearchParams}
                    getDynamicParamFromSegment={getDynamicParamFromSegment}
                  />
                  {appUsingSizeAdjust ? <meta name="next-size-adjust" /> : null}
                </>
              }
              globalErrorComponent={GlobalError}
              notFound={
                NotFound && RootLayout ? (
                  <RootLayout params={{}}>
                    {notFoundStyles}
                    <NotFound />
                  </RootLayout>
                ) : undefined
              }
              asNotFound={props.asNotFound}
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

    const { HeadManagerContext } =
      require('../../shared/lib/head-manager-context') as typeof import('../../shared/lib/head-manager-context')
    const serverInsertedHTMLCallbacks: Set<() => React.ReactNode> = new Set()
    function InsertedHTML({ children }: { children: JSX.Element }) {
      // Reset addInsertedHtmlCallback on each render
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

          const flushed = renderToString({
            ReactDOMServer: require('react-dom/server.edge'),
            element: (
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
            ),
          })
          polyfillsFlushed = true
          return flushed
        }

        try {
          const renderStream = await renderToInitialStream({
            ReactDOMServer: require('react-dom/server.edge'),
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
          if (isRedirectError(err)) {
            res.statusCode = 307
            res.setHeader('Location', getURLFromRedirectError(err))
          }

          const renderStream = await renderToInitialStream({
            ReactDOMServer: require('react-dom/server.edge'),
            element: (
              <html id="__next_error__">
                <head>
                  {/* @ts-expect-error allow to use async server component */}
                  <MetadataTree
                    key={requestId}
                    tree={['', {}, {}]}
                    pathname={pathname}
                    searchParams={providedSearchParams}
                    getDynamicParamFromSegment={getDynamicParamFromSegment}
                  />
                  {appUsingSizeAdjust ? <meta name="next-size-adjust" /> : null}
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
    const actionRequestResult = await handleAction({
      req,
      res,
      ComponentMod,
      pathname: renderOpts.pathname,
      serverActionsManifest,
      generateFlight,
      staticGenerationStore,
    })

    if (actionRequestResult === 'not-found') {
      return new RenderResult(await bodyResult({ asNotFound: true }))
    } else if (actionRequestResult) {
      return actionRequestResult
    }

    const renderResult = new RenderResult(
      await bodyResult({
        asNotFound: pagePath === '/404',
      })
    )

    if (staticGenerationStore.pendingRevalidates) {
      await Promise.all(staticGenerationStore.pendingRevalidates)
    }
    addImplicitTags(staticGenerationStore)
    ;(renderOpts as any).fetchTags = staticGenerationStore.tags?.join(',')

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
        { pathname: pagePath, renderOpts },
        () => wrappedRender()
      )
  )
}
