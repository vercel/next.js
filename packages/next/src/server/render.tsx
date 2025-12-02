/* eslint-disable @next/internal/no-ambiguous-jsx -- Pages router doesn't use react-server */
import type { IncomingMessage, ServerResponse } from 'http'
import type { ParsedUrlQuery } from 'querystring'
import type { ReactDOMServerReadableStream } from 'react-dom/server'
import type { NextRouter } from '../shared/lib/router/router'
import type { HtmlProps } from '../shared/lib/html-context.shared-runtime'
import type { DomainLocale } from './config'
import type {
  AppType,
  DocumentInitialProps,
  DocumentType,
  DocumentProps,
  DocumentContext,
  NextComponentType,
  RenderPage,
  RenderPageResult,
} from '../shared/lib/utils'
import type { ImageConfigComplete } from '../shared/lib/image-config'
import type { Redirect } from '../lib/load-custom-routes'
import {
  type NextApiRequestCookies,
  type __ApiPreviewProps,
  setLazyProp,
} from './api-utils'
import { getCookieParser } from './api-utils/get-cookie-parser'
import type { LoadComponentsReturnType } from './load-components'
import type {
  GetServerSideProps,
  GetStaticProps,
  PreviewData,
  ServerRuntime,
  SizeLimit,
} from '../types'
import type { UnwrapPromise } from '../lib/coalesced-function'
import type { ClientReferenceManifest } from '../build/webpack/plugins/flight-manifest-plugin'
import type { NextFontManifest } from '../build/webpack/plugins/next-font-manifest-plugin'
import type { PagesModule } from './route-modules/pages/module'
import type { ComponentsEnhancer } from '../shared/lib/utils'
import type { NextParsedUrlQuery } from './request-meta'
import type { Revalidate } from './lib/cache-control'
import type { COMPILER_NAMES } from '../shared/lib/constants'

import React, { type JSX } from 'react'
import ReactDOMServerPages from 'next/dist/server/ReactDOMServerPages'
import { StyleRegistry, createStyleRegistry } from 'styled-jsx'
import {
  GSP_NO_RETURNED_VALUE,
  GSSP_COMPONENT_MEMBER_ERROR,
  GSSP_NO_RETURNED_VALUE,
  STATIC_STATUS_PAGE_GET_INITIAL_PROPS_ERROR,
  SERVER_PROPS_GET_INIT_PROPS_CONFLICT,
  SERVER_PROPS_SSG_CONFLICT,
  SSG_GET_INITIAL_PROPS_CONFLICT,
  UNSTABLE_REVALIDATE_RENAME_ERROR,
  HTML_CONTENT_TYPE_HEADER,
  JSON_CONTENT_TYPE_HEADER,
} from '../lib/constants'
import {
  NEXT_BUILTIN_DOCUMENT,
  SERVER_PROPS_ID,
  STATIC_PROPS_ID,
  STATIC_STATUS_PAGES,
} from '../shared/lib/constants'
import { isSerializableProps } from '../lib/is-serializable-props'
import { defaultHead } from '../shared/lib/head'
import { HeadManagerContext } from '../shared/lib/head-manager-context.shared-runtime'
import Loadable from '../shared/lib/loadable.shared-runtime'
import { LoadableContext } from '../shared/lib/loadable-context.shared-runtime'
import { RouterContext } from '../shared/lib/router-context.shared-runtime'
import { isDynamicRoute } from '../shared/lib/router/utils/is-dynamic'
import {
  getDisplayName,
  isResSent,
  loadGetInitialProps,
} from '../shared/lib/utils'
import { HtmlContext } from '../shared/lib/html-context.shared-runtime'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import { getRequestMeta } from './request-meta'
import { allowedStatusCodes, getRedirectStatus } from '../lib/redirect-status'
import RenderResult, { type PagesRenderResultMetadata } from './render-result'
import isError from '../lib/is-error'
import {
  streamToString,
  renderToInitialFizzStream,
} from './stream-utils/node-web-streams-helper'
import { ImageConfigContext } from '../shared/lib/image-config-context.shared-runtime'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import { stripInternalQueries } from './internal-utils'
import {
  adaptForAppRouterInstance,
  adaptForPathParams,
  adaptForSearchParams,
  PathnameContextProviderAdapter,
} from '../shared/lib/router/adapters'
import { AppRouterContext } from '../shared/lib/app-router-context.shared-runtime'
import {
  SearchParamsContext,
  PathParamsContext,
} from '../shared/lib/hooks-client-context.shared-runtime'
import { getTracer } from './lib/trace/tracer'
import { RenderSpan } from './lib/trace/constants'
import { ReflectAdapter } from './web/spec-extension/adapters/reflect'
import { getCacheControlHeader } from './lib/cache-control'
import { getErrorSource } from '../shared/lib/error-source'
import type { DeepReadonly } from '../shared/lib/deep-readonly'
import type { PagesDevOverlayBridgeType } from '../next-devtools/userspace/pages/pages-dev-overlay-setup'
import { getScriptNonceFromHeader } from './app-render/get-script-nonce-from-header'

let tryGetPreviewData: typeof import('./api-utils/node/try-get-preview-data').tryGetPreviewData
let warn: typeof import('../build/output/log').warn
let postProcessHTML: typeof import('./post-process').postProcessHTML

const DOCTYPE = '<!DOCTYPE html>'

if (process.env.NEXT_RUNTIME !== 'edge') {
  tryGetPreviewData = (
    require('./api-utils/node/try-get-preview-data') as typeof import('./api-utils/node/try-get-preview-data')
  ).tryGetPreviewData
  warn = (
    require('../build/output/log') as typeof import('../build/output/log')
  ).warn
  postProcessHTML = (
    require('./post-process') as typeof import('./post-process')
  ).postProcessHTML
} else {
  warn = console.warn.bind(console)
  postProcessHTML = async (html: string) => html
}

function noRouter() {
  const message =
    'No router instance found. you should only use "next/router" inside the client side of your app. https://nextjs.org/docs/messages/no-router-instance'
  throw new Error(message)
}

async function renderToString(element: React.ReactElement) {
  const renderStream = await ReactDOMServerPages.renderToReadableStream(element)
  await renderStream.allReady
  return streamToString(renderStream)
}

class ServerRouter implements NextRouter {
  route: string
  pathname: string
  query: ParsedUrlQuery
  asPath: string
  basePath: string
  events: any
  isFallback: boolean
  locale?: string
  isReady: boolean
  locales?: readonly string[]
  defaultLocale?: string
  domainLocales?: readonly DomainLocale[]
  isPreview: boolean
  isLocaleDomain: boolean

  constructor(
    pathname: string,
    query: ParsedUrlQuery,
    as: string,
    { isFallback }: { isFallback: boolean },
    isReady: boolean,
    basePath: string,
    locale?: string,
    locales?: readonly string[],
    defaultLocale?: string,
    domainLocales?: readonly DomainLocale[],
    isPreview?: boolean,
    isLocaleDomain?: boolean
  ) {
    this.route = pathname.replace(/\/$/, '') || '/'
    this.pathname = pathname
    this.query = query
    this.asPath = as
    this.isFallback = isFallback
    this.basePath = basePath
    this.locale = locale
    this.locales = locales
    this.defaultLocale = defaultLocale
    this.isReady = isReady
    this.domainLocales = domainLocales
    this.isPreview = !!isPreview
    this.isLocaleDomain = !!isLocaleDomain
  }

  push(): any {
    noRouter()
  }
  replace(): any {
    noRouter()
  }
  reload() {
    noRouter()
  }
  back() {
    noRouter()
  }
  forward(): void {
    noRouter()
  }
  prefetch(): any {
    noRouter()
  }
  beforePopState() {
    noRouter()
  }
}

function enhanceComponents(
  options: ComponentsEnhancer,
  App: AppType,
  Component: NextComponentType
): {
  App: AppType
  Component: NextComponentType
} {
  // For backwards compatibility
  if (typeof options === 'function') {
    return {
      App,
      Component: options(Component),
    }
  }

  return {
    App: options.enhanceApp ? options.enhanceApp(App) : App,
    Component: options.enhanceComponent
      ? options.enhanceComponent(Component)
      : Component,
  }
}

function renderPageTree(
  App: AppType,
  Component: NextComponentType,
  props: any
) {
  return <App Component={Component} {...props} />
}

export type RenderOptsPartial = {
  assetPrefix?: string
  err?: Error | null
  nextExport?: boolean
  dev?: boolean
  ErrorDebug?: PagesDevOverlayBridgeType
  isNextDataRequest?: boolean
  params?: ParsedUrlQuery
  previewProps: __ApiPreviewProps | undefined
  basePath: string
  unstable_runtimeJS?: false
  unstable_JsPreload?: false
  optimizeCss: any
  nextConfigOutput?: 'standalone' | 'export'
  nextScriptWorkers: any
  assetQueryString?: string
  resolvedUrl?: string
  resolvedAsPath?: string
  setIsrStatus?: (key: string, value: boolean | undefined) => void
  clientReferenceManifest?: DeepReadonly<ClientReferenceManifest>
  nextFontManifest?: DeepReadonly<NextFontManifest>
  distDir?: string
  locale?: string
  locales?: readonly string[]
  defaultLocale?: string
  domainLocales?: readonly DomainLocale[]
  disableOptimizedLoading?: boolean
  supportsDynamicResponse: boolean
  botType?: 'dom' | 'html' | undefined
  serveStreamingMetadata?: boolean
  runtime?: ServerRuntime
  serverComponents?: boolean
  serverActions?: {
    bodySizeLimit?: SizeLimit
    allowedOrigins?: string[]
  }
  crossOrigin?: 'anonymous' | 'use-credentials' | '' | undefined
  images: ImageConfigComplete
  largePageDataBytes?: number
  isOnDemandRevalidate?: boolean
  isPossibleServerAction?: boolean
  isExperimentalCompile?: boolean
  isPrefetch?: boolean
  isBot?: boolean
  expireTime?: number
  experimental: {
    clientTraceMetadata?: string[]
  }
}

export type RenderOpts = LoadComponentsReturnType<PagesModule> &
  RenderOptsPartial

/**
 * Shared context used for all page renders.
 */
export type PagesSharedContext = {
  /**
   * Used to facilitate caching of page bundles, we send it to the client so
   * that pageloader knows where to load bundles.
   */
  buildId: string

  /**
   * The deployment ID if the user is deploying to a platform that provides one.
   */
  deploymentId: string | undefined

  /**
   * True if the user is using a custom server.
   */
  customServer: true | undefined
}

/**
 * The context for the given request.
 */
export type PagesRenderContext = {
  /**
   * Whether this should be rendered as a fallback page.
   */
  isFallback: boolean

  /**
   * Whether this is in draft mode.
   */
  isDraftMode: boolean | undefined

  /**
   * In development, the original source page that returned a 404.
   */
  developmentNotFoundSourcePage: string | undefined
}

/**
 * RenderOptsExtra is being used to split away functionality that's within the
 * renderOpts. Eventually we can have more explicit render options for each
 * route kind.
 */
export type RenderOptsExtra = {
  App: AppType
  Document: DocumentType
}

const invalidKeysMsg = (
  methodName: 'getServerSideProps' | 'getStaticProps',
  invalidKeys: string[]
) => {
  const docsPathname = `invalid-${methodName.toLocaleLowerCase()}-value`

  return (
    `Additional keys were returned from \`${methodName}\`. Properties intended for your component must be nested under the \`props\` key, e.g.:` +
    `\n\n\treturn { props: { title: 'My Title', content: '...' } }` +
    `\n\nKeys that need to be moved: ${invalidKeys.join(', ')}.` +
    `\nRead more: https://nextjs.org/docs/messages/${docsPathname}`
  )
}

function checkRedirectValues(
  redirect: Redirect,
  req: IncomingMessage,
  method: 'getStaticProps' | 'getServerSideProps'
) {
  const { destination, permanent, statusCode, basePath } = redirect
  let errors: string[] = []

  const hasStatusCode = typeof statusCode !== 'undefined'
  const hasPermanent = typeof permanent !== 'undefined'

  if (hasPermanent && hasStatusCode) {
    errors.push(`\`permanent\` and \`statusCode\` can not both be provided`)
  } else if (hasPermanent && typeof permanent !== 'boolean') {
    errors.push(`\`permanent\` must be \`true\` or \`false\``)
  } else if (hasStatusCode && !allowedStatusCodes.has(statusCode!)) {
    errors.push(
      `\`statusCode\` must undefined or one of ${[...allowedStatusCodes].join(
        ', '
      )}`
    )
  }
  const destinationType = typeof destination

  if (destinationType !== 'string') {
    errors.push(
      `\`destination\` should be string but received ${destinationType}`
    )
  }

  const basePathType = typeof basePath

  if (basePathType !== 'undefined' && basePathType !== 'boolean') {
    errors.push(
      `\`basePath\` should be undefined or a false, received ${basePathType}`
    )
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid redirect object returned from ${method} for ${req.url}\n` +
        errors.join(' and ') +
        '\n' +
        `See more info here: https://nextjs.org/docs/messages/invalid-redirect-gssp`
    )
  }
}

export function errorToJSON(err: Error) {
  let source: typeof COMPILER_NAMES.server | typeof COMPILER_NAMES.edgeServer =
    'server'

  if (process.env.NEXT_RUNTIME !== 'edge') {
    source = getErrorSource(err) || 'server'
  }

  return {
    name: err.name,
    source,
    message: stripAnsi(err.message),
    stack: err.stack,
    digest: (err as any).digest,
  }
}

function serializeError(
  dev: boolean | undefined,
  err: Error
): Error & {
  statusCode?: number
  source?: typeof COMPILER_NAMES.server | typeof COMPILER_NAMES.edgeServer
} {
  if (dev) {
    return errorToJSON(err)
  }

  return {
    name: 'Internal Server Error.',
    message: '500 - Internal Server Error.',
    statusCode: 500,
  }
}

export async function renderToHTMLImpl(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  query: NextParsedUrlQuery,
  renderOpts: Omit<RenderOpts, keyof RenderOptsExtra>,
  extra: RenderOptsExtra,
  sharedContext: PagesSharedContext,
  renderContext: PagesRenderContext
): Promise<RenderResult> {
  // Adds support for reading `cookies` in `getServerSideProps` when SSR.
  setLazyProp({ req: req as any }, 'cookies', getCookieParser(req.headers))

  const metadata: PagesRenderResultMetadata = {}

  metadata.assetQueryString =
    (renderOpts.dev && renderOpts.assetQueryString) || ''

  if (renderOpts.dev && !metadata.assetQueryString) {
    const userAgent = (req.headers['user-agent'] || '').toLowerCase()
    if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
      // In dev we invalidate the cache by appending a timestamp to the resource URL.
      // This is a workaround to fix https://github.com/vercel/next.js/issues/5860
      // TODO: remove this workaround when https://bugs.webkit.org/show_bug.cgi?id=187726 is fixed.
      // Note: The workaround breaks breakpoints on reload since the script url always changes,
      // so we only apply it to Safari.
      metadata.assetQueryString = `?ts=${Date.now()}`
    }
  }

  // if deploymentId is provided we append it to all asset requests
  if (sharedContext.deploymentId) {
    metadata.assetQueryString += `${metadata.assetQueryString ? '&' : '?'}dpl=${
      sharedContext.deploymentId
    }`
  }

  // don't modify original query object
  query = Object.assign({}, query)

  const {
    err,
    dev = false,
    pageConfig = {},
    buildManifest,
    reactLoadableManifest,
    ErrorDebug,
    getStaticProps,
    getStaticPaths,
    getServerSideProps,
    isNextDataRequest,
    params,
    previewProps,
    basePath,
    images,
    runtime: globalRuntime,
    isExperimentalCompile,
    expireTime,
  } = renderOpts
  const { App } = extra

  const assetQueryString = metadata.assetQueryString

  let Document = extra.Document

  let Component: React.ComponentType<{}> | ((props: any) => JSX.Element) =
    renderOpts.Component
  const OriginComponent = Component

  const isFallback = renderContext.isFallback ?? false
  const notFoundSrcPage = renderContext.developmentNotFoundSourcePage

  // next internal queries should be stripped out
  stripInternalQueries(query)

  const isSSG = !!getStaticProps
  const isBuildTimeSSG = isSSG && renderOpts.nextExport
  const defaultAppGetInitialProps =
    App.getInitialProps === (App as any).origGetInitialProps

  const hasPageGetInitialProps = !!(Component as any)?.getInitialProps
  const hasPageScripts = (Component as any)?.unstable_scriptLoader

  const pageIsDynamic = isDynamicRoute(pathname)

  const defaultErrorGetInitialProps =
    pathname === '/_error' &&
    (Component as any).getInitialProps ===
      (Component as any).origGetInitialProps

  if (
    renderOpts.nextExport &&
    hasPageGetInitialProps &&
    !defaultErrorGetInitialProps
  ) {
    warn(
      `Detected getInitialProps on page '${pathname}'` +
        ` while running export. It's recommended to use getStaticProps` +
        ` which has a more correct behavior for static exporting.` +
        `\nRead more: https://nextjs.org/docs/messages/get-initial-props-export`
    )
  }

  let isAutoExport =
    !hasPageGetInitialProps &&
    defaultAppGetInitialProps &&
    !isSSG &&
    !getServerSideProps

  // if we are running from experimental compile and the page
  // would normally be automatically statically optimized
  // ensure we set cache header so it's not rendered on-demand
  // every request
  if (isAutoExport && !dev && isExperimentalCompile) {
    res.setHeader(
      'Cache-Control',
      getCacheControlHeader({ revalidate: false, expire: expireTime })
    )
    isAutoExport = false
  }

  if (hasPageGetInitialProps && isSSG) {
    throw new Error(SSG_GET_INITIAL_PROPS_CONFLICT + ` ${pathname}`)
  }

  if (hasPageGetInitialProps && getServerSideProps) {
    throw new Error(SERVER_PROPS_GET_INIT_PROPS_CONFLICT + ` ${pathname}`)
  }

  if (getServerSideProps && isSSG) {
    throw new Error(SERVER_PROPS_SSG_CONFLICT + ` ${pathname}`)
  }

  if (getServerSideProps && renderOpts.nextConfigOutput === 'export') {
    throw new Error(
      'getServerSideProps cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
    )
  }

  if (getStaticPaths && !pageIsDynamic) {
    throw new Error(
      `getStaticPaths is only allowed for dynamic SSG pages and was found on '${pathname}'.` +
        `\nRead more: https://nextjs.org/docs/messages/non-dynamic-getstaticpaths-usage`
    )
  }

  if (!!getStaticPaths && !isSSG) {
    throw new Error(
      `getStaticPaths was added without a getStaticProps in ${pathname}. Without getStaticProps, getStaticPaths does nothing`
    )
  }

  if (isSSG && pageIsDynamic && !getStaticPaths) {
    throw new Error(
      `getStaticPaths is required for dynamic SSG pages and is missing for '${pathname}'.` +
        `\nRead more: https://nextjs.org/docs/messages/invalid-getstaticpaths-value`
    )
  }

  let asPath: string = renderOpts.resolvedAsPath || (req.url as string)

  if (dev) {
    const { isValidElementType } =
      require('next/dist/compiled/react-is') as typeof import('next/dist/compiled/react-is')
    if (!isValidElementType(Component)) {
      throw new Error(
        `The default export is not a React Component in page: "${pathname}"`
      )
    }

    if (!isValidElementType(App)) {
      throw new Error(
        `The default export is not a React Component in page: "/_app"`
      )
    }

    if (!isValidElementType(Document)) {
      throw new Error(
        `The default export is not a React Component in page: "/_document"`
      )
    }

    if (isAutoExport || isFallback) {
      // remove query values except ones that will be set during export
      query = {}
      asPath = `${pathname}${
        // ensure trailing slash is present for non-dynamic auto-export pages
        req.url!.endsWith('/') && pathname !== '/' && !pageIsDynamic ? '/' : ''
      }`
      req.url = pathname
    }

    if (pathname === '/404' && (hasPageGetInitialProps || getServerSideProps)) {
      throw new Error(
        `\`pages/404\` ${STATIC_STATUS_PAGE_GET_INITIAL_PROPS_ERROR}`
      )
    }
    if (
      STATIC_STATUS_PAGES.includes(pathname) &&
      (hasPageGetInitialProps || getServerSideProps)
    ) {
      throw new Error(
        `\`pages${pathname}\` ${STATIC_STATUS_PAGE_GET_INITIAL_PROPS_ERROR}`
      )
    }

    if (renderOpts?.setIsrStatus) {
      renderOpts.setIsrStatus(asPath, isSSG || isAutoExport)
    }
  }

  for (const methodName of [
    'getStaticProps',
    'getServerSideProps',
    'getStaticPaths',
  ]) {
    if ((Component as any)?.[methodName]) {
      throw new Error(
        `page ${pathname} ${methodName} ${GSSP_COMPONENT_MEMBER_ERROR}`
      )
    }
  }

  await Loadable.preloadAll() // Make sure all dynamic imports are loaded

  let isPreview: boolean | undefined = undefined
  let previewData: PreviewData

  if (
    (isSSG || getServerSideProps) &&
    !isFallback &&
    process.env.NEXT_RUNTIME !== 'edge' &&
    previewProps
  ) {
    // Reads of this are cached on the `req` object, so this should resolve
    // instantly. There's no need to pass this data down from a previous
    // invoke.
    previewData = tryGetPreviewData(
      req,
      res,
      previewProps,
      !!renderOpts.multiZoneDraftMode
    )
    isPreview = previewData !== false
  }

  // url will always be set
  const routerIsReady = !!(
    getServerSideProps ||
    hasPageGetInitialProps ||
    (!defaultAppGetInitialProps && !isSSG) ||
    isExperimentalCompile
  )
  const router = new ServerRouter(
    pathname,
    query,
    asPath,
    {
      isFallback: isFallback,
    },
    routerIsReady,
    basePath,
    renderOpts.locale,
    renderOpts.locales,
    renderOpts.defaultLocale,
    renderOpts.domainLocales,
    isPreview,
    getRequestMeta(req, 'isLocaleDomain')
  )

  const appRouter = adaptForAppRouterInstance(router)

  let scriptLoader: any = {}
  const jsxStyleRegistry = createStyleRegistry()

  let head: JSX.Element[] = defaultHead()
  const reactLoadableModules: string[] = []

  let initialScripts: any = {}
  if (hasPageScripts) {
    initialScripts.beforeInteractive = []
      .concat(hasPageScripts())
      .filter((script: any) => script.props.strategy === 'beforeInteractive')
      .map((script: any) => script.props)
  }

  const csp =
    req.headers['content-security-policy'] ||
    req.headers['content-security-policy-report-only']

  const nonce =
    typeof csp === 'string' ? getScriptNonceFromHeader(csp) : undefined

  const AppContainer = ({ children }: { children: JSX.Element }) => (
    <AppRouterContext.Provider value={appRouter}>
      <SearchParamsContext.Provider value={adaptForSearchParams(router)}>
        <PathnameContextProviderAdapter
          router={router}
          isAutoExport={isAutoExport}
        >
          <PathParamsContext.Provider value={adaptForPathParams(router)}>
            <RouterContext.Provider value={router}>
              <HeadManagerContext.Provider
                value={{
                  updateHead: (state) => {
                    head = state
                  },
                  updateScripts: (scripts) => {
                    scriptLoader = scripts
                  },
                  scripts: initialScripts,
                  mountedInstances: new Set(),
                  nonce,
                }}
              >
                <LoadableContext.Provider
                  value={(moduleName) => reactLoadableModules.push(moduleName)}
                >
                  <StyleRegistry registry={jsxStyleRegistry}>
                    <ImageConfigContext.Provider value={images}>
                      {children}
                    </ImageConfigContext.Provider>
                  </StyleRegistry>
                </LoadableContext.Provider>
              </HeadManagerContext.Provider>
            </RouterContext.Provider>
          </PathParamsContext.Provider>
        </PathnameContextProviderAdapter>
      </SearchParamsContext.Provider>
    </AppRouterContext.Provider>
  )

  // The `useId` API uses the path indexes to generate an ID for each node.
  // To guarantee the match of hydration, we need to ensure that the structure
  // of wrapper nodes is isomorphic in server and client.
  // TODO: With `enhanceApp` and `enhanceComponents` options, this approach may
  // not be useful.
  // https://github.com/facebook/react/pull/22644
  const Noop = () => null
  const AppContainerWithIsomorphicFiberStructure: React.FC<{
    children: JSX.Element
  }> = ({ children }) => {
    return (
      <>
        {/* <Head/> */}
        <Noop />
        <AppContainer>
          <>
            {children}
            {/* <RouteAnnouncer/> */}
            <Noop />
          </>
        </AppContainer>
      </>
    )
  }

  const ctx = {
    err,
    req: isAutoExport ? undefined : req,
    res: isAutoExport ? undefined : res,
    pathname,
    query,
    asPath,
    locale: renderOpts.locale,
    locales: renderOpts.locales,
    defaultLocale: renderOpts.defaultLocale,
    AppTree: (props: any) => {
      return (
        <AppContainerWithIsomorphicFiberStructure>
          {renderPageTree(App, OriginComponent, { ...props, router })}
        </AppContainerWithIsomorphicFiberStructure>
      )
    },
    defaultGetInitialProps: async (
      docCtx: DocumentContext,
      options: { nonce?: string } = {}
    ): Promise<DocumentInitialProps> => {
      const enhanceApp = (AppComp: any) => {
        return (props: any) => <AppComp {...props} />
      }

      const { html, head: renderPageHead } = await docCtx.renderPage({
        enhanceApp,
      })
      const styles = jsxStyleRegistry.styles({ nonce: options.nonce || nonce })
      jsxStyleRegistry.flush()
      return { html, head: renderPageHead, styles }
    },
  }
  let props: any

  const nextExport =
    !isSSG && (renderOpts.nextExport || (dev && (isAutoExport || isFallback)))

  const styledJsxInsertedHTML = () => {
    const styles = jsxStyleRegistry.styles()
    jsxStyleRegistry.flush()
    return <>{styles}</>
  }

  props = await loadGetInitialProps(App, {
    AppTree: ctx.AppTree,
    Component,
    router,
    ctx,
  })

  if ((isSSG || getServerSideProps) && isPreview) {
    props.__N_PREVIEW = true
  }

  if (isSSG) {
    props[STATIC_PROPS_ID] = true
  }

  if (isSSG && !isFallback) {
    let data: Readonly<UnwrapPromise<ReturnType<GetStaticProps>>>

    try {
      data = await getTracer().trace(
        RenderSpan.getStaticProps,
        {
          spanName: `getStaticProps ${pathname}`,
          attributes: {
            'next.route': pathname,
          },
        },
        () =>
          getStaticProps({
            ...(pageIsDynamic ? { params } : undefined),
            ...(isPreview
              ? { draftMode: true, preview: true, previewData: previewData }
              : undefined),
            locales: [...(renderOpts.locales ?? [])],
            locale: renderOpts.locale,
            defaultLocale: renderOpts.defaultLocale,
            revalidateReason: renderOpts.isOnDemandRevalidate
              ? 'on-demand'
              : isBuildTimeSSG
                ? 'build'
                : 'stale',
          })
      )
    } catch (staticPropsError: any) {
      // remove not found error code to prevent triggering legacy
      // 404 rendering
      if (staticPropsError && staticPropsError.code === 'ENOENT') {
        delete staticPropsError.code
      }
      throw staticPropsError
    }

    if (data == null) {
      throw new Error(GSP_NO_RETURNED_VALUE)
    }

    const invalidKeys = Object.keys(data).filter(
      (key) =>
        key !== 'revalidate' &&
        key !== 'props' &&
        key !== 'redirect' &&
        key !== 'notFound'
    )

    if (invalidKeys.includes('unstable_revalidate')) {
      throw new Error(UNSTABLE_REVALIDATE_RENAME_ERROR)
    }

    if (invalidKeys.length) {
      throw new Error(invalidKeysMsg('getStaticProps', invalidKeys))
    }

    if (process.env.NODE_ENV !== 'production') {
      if (
        typeof (data as any).notFound !== 'undefined' &&
        typeof (data as any).redirect !== 'undefined'
      ) {
        throw new Error(
          `\`redirect\` and \`notFound\` can not both be returned from ${
            isSSG ? 'getStaticProps' : 'getServerSideProps'
          } at the same time. Page: ${pathname}\nSee more info here: https://nextjs.org/docs/messages/gssp-mixed-not-found-redirect`
        )
      }
    }

    if ('notFound' in data && data.notFound) {
      if (pathname === '/404') {
        throw new Error(
          `The /404 page can not return notFound in "getStaticProps", please remove it to continue!`
        )
      }

      metadata.isNotFound = true
    }

    if (
      'redirect' in data &&
      data.redirect &&
      typeof data.redirect === 'object'
    ) {
      checkRedirectValues(data.redirect as Redirect, req, 'getStaticProps')

      if (isBuildTimeSSG) {
        throw new Error(
          `\`redirect\` can not be returned from getStaticProps during prerendering (${req.url})\n` +
            `See more info here: https://nextjs.org/docs/messages/gsp-redirect-during-prerender`
        )
      }

      ;(data as any).props = {
        __N_REDIRECT: data.redirect.destination,
        __N_REDIRECT_STATUS: getRedirectStatus(data.redirect),
      }
      if (typeof data.redirect.basePath !== 'undefined') {
        ;(data as any).props.__N_REDIRECT_BASE_PATH = data.redirect.basePath
      }
      metadata.isRedirect = true
    }

    if (
      (dev || isBuildTimeSSG) &&
      !metadata.isNotFound &&
      !isSerializableProps(pathname, 'getStaticProps', (data as any).props)
    ) {
      // this fn should throw an error instead of ever returning `false`
      throw new Error(
        'invariant: getStaticProps did not return valid props. Please report this.'
      )
    }

    let revalidate: Revalidate
    if ('revalidate' in data) {
      if (data.revalidate && renderOpts.nextConfigOutput === 'export') {
        throw new Error(
          'ISR cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
        )
      }
      if (typeof data.revalidate === 'number') {
        if (!Number.isInteger(data.revalidate)) {
          throw new Error(
            `A page's revalidate option must be seconds expressed as a natural number for ${req.url}. Mixed numbers, such as '${data.revalidate}', cannot be used.` +
              `\nTry changing the value to '${Math.ceil(
                data.revalidate
              )}' or using \`Math.ceil()\` if you're computing the value.`
          )
        } else if (data.revalidate <= 0) {
          throw new Error(
            `A page's revalidate option can not be less than or equal to zero for ${req.url}. A revalidate option of zero means to revalidate after _every_ request, and implies stale data cannot be tolerated.` +
              `\n\nTo never revalidate, you can set revalidate to \`false\` (only ran once at build-time).` +
              `\nTo revalidate as soon as possible, you can set the value to \`1\`.`
          )
        } else {
          if (data.revalidate > 31536000) {
            // if it's greater than a year for some reason error
            console.warn(
              `Warning: A page's revalidate option was set to more than a year for ${req.url}. This may have been done in error.` +
                `\nTo only run getStaticProps at build-time and not revalidate at runtime, you can set \`revalidate\` to \`false\`!`
            )
          }

          revalidate = data.revalidate
        }
      } else if (data.revalidate === true) {
        // When enabled, revalidate after 1 second. This value is optimal for
        // the most up-to-date page possible, but without a 1-to-1
        // request-refresh ratio.
        revalidate = 1
      } else if (
        data.revalidate === false ||
        typeof data.revalidate === 'undefined'
      ) {
        // By default, we never revalidate.
        revalidate = false
      } else {
        throw new Error(
          `A page's revalidate option must be seconds expressed as a natural number. Mixed numbers and strings cannot be used. Received '${JSON.stringify(
            data.revalidate
          )}' for ${req.url}`
        )
      }
    } else {
      // By default, we never revalidate.
      revalidate = false
    }

    props.pageProps = Object.assign(
      {},
      props.pageProps,
      'props' in data ? data.props : undefined
    )

    // pass up cache control and props for export
    metadata.cacheControl = { revalidate, expire: undefined }
    metadata.pageData = props

    // this must come after revalidate is added to renderResultMeta
    if (metadata.isNotFound) {
      return new RenderResult(null, {
        metadata,
        contentType: null,
      })
    }
  }

  if (getServerSideProps) {
    props[SERVER_PROPS_ID] = true
  }

  if (getServerSideProps && !isFallback) {
    let data: UnwrapPromise<ReturnType<GetServerSideProps>>

    let canAccessRes = true
    let resOrProxy = res
    let deferredContent = false
    if (process.env.NODE_ENV !== 'production') {
      resOrProxy = new Proxy<ServerResponse>(res, {
        get: function (obj, prop) {
          if (!canAccessRes) {
            const message =
              `You should not access 'res' after getServerSideProps resolves.` +
              `\nRead more: https://nextjs.org/docs/messages/gssp-no-mutating-res`

            if (deferredContent) {
              throw new Error(message)
            } else {
              warn(message)
            }
          }

          if (typeof prop === 'symbol') {
            return ReflectAdapter.get(obj, prop, res)
          }

          return ReflectAdapter.get(obj, prop, res)
        },
      })
    }

    try {
      data = await getTracer().trace(
        RenderSpan.getServerSideProps,
        {
          spanName: `getServerSideProps ${pathname}`,
          attributes: {
            'next.route': pathname,
          },
        },
        async () =>
          getServerSideProps({
            req: req as IncomingMessage & {
              cookies: NextApiRequestCookies
            },
            res: resOrProxy,
            query,
            resolvedUrl: renderOpts.resolvedUrl as string,
            ...(pageIsDynamic ? { params } : undefined),
            ...(previewData !== false
              ? { draftMode: true, preview: true, previewData: previewData }
              : undefined),
            // We create a copy here to avoid having the types of
            // `getServerSideProps` change. This ensures that users can't
            // mutate this array and have it poison the reference.
            locales: [...(renderOpts.locales ?? [])],
            locale: renderOpts.locale,
            defaultLocale: renderOpts.defaultLocale,
          })
      )
      canAccessRes = false
      metadata.cacheControl = { revalidate: 0, expire: undefined }
    } catch (serverSidePropsError: any) {
      // remove not found error code to prevent triggering legacy
      // 404 rendering
      if (
        isError(serverSidePropsError) &&
        serverSidePropsError.code === 'ENOENT'
      ) {
        delete serverSidePropsError.code
      }
      throw serverSidePropsError
    }

    if (data == null) {
      throw new Error(GSSP_NO_RETURNED_VALUE)
    }

    if ((data as any).props instanceof Promise) {
      deferredContent = true
    }

    const invalidKeys = Object.keys(data).filter(
      (key) => key !== 'props' && key !== 'redirect' && key !== 'notFound'
    )

    if ((data as any).unstable_notFound) {
      throw new Error(
        `unstable_notFound has been renamed to notFound, please update the field to continue. Page: ${pathname}`
      )
    }
    if ((data as any).unstable_redirect) {
      throw new Error(
        `unstable_redirect has been renamed to redirect, please update the field to continue. Page: ${pathname}`
      )
    }

    if (invalidKeys.length) {
      throw new Error(invalidKeysMsg('getServerSideProps', invalidKeys))
    }

    if ('notFound' in data && data.notFound) {
      if (pathname === '/404') {
        throw new Error(
          `The /404 page can not return notFound in "getStaticProps", please remove it to continue!`
        )
      }

      metadata.isNotFound = true
      return new RenderResult(null, {
        metadata,
        contentType: null,
      })
    }

    if ('redirect' in data && typeof data.redirect === 'object') {
      checkRedirectValues(data.redirect as Redirect, req, 'getServerSideProps')
      ;(data as any).props = {
        __N_REDIRECT: data.redirect.destination,
        __N_REDIRECT_STATUS: getRedirectStatus(data.redirect),
      }
      if (typeof data.redirect.basePath !== 'undefined') {
        ;(data as any).props.__N_REDIRECT_BASE_PATH = data.redirect.basePath
      }
      metadata.isRedirect = true
    }

    if (deferredContent) {
      ;(data as any).props = await (data as any).props
    }

    if (
      (dev || isBuildTimeSSG) &&
      !isSerializableProps(pathname, 'getServerSideProps', (data as any).props)
    ) {
      // this fn should throw an error instead of ever returning `false`
      throw new Error(
        'invariant: getServerSideProps did not return valid props. Please report this.'
      )
    }

    props.pageProps = Object.assign({}, props.pageProps, (data as any).props)
    metadata.pageData = props
  }

  if (
    !isSSG && // we only show this warning for legacy pages
    !getServerSideProps &&
    process.env.NODE_ENV !== 'production' &&
    Object.keys(props?.pageProps || {}).includes('url')
  ) {
    console.warn(
      `The prop \`url\` is a reserved prop in Next.js for legacy reasons and will be overridden on page ${pathname}\n` +
        `See more info here: https://nextjs.org/docs/messages/reserved-page-prop`
    )
  }

  // Avoid rendering page un-necessarily for getServerSideProps data request
  // and getServerSideProps/getStaticProps redirects
  if ((isNextDataRequest && !isSSG) || metadata.isRedirect) {
    return new RenderResult(JSON.stringify(props), {
      metadata,
      contentType: JSON_CONTENT_TYPE_HEADER,
    })
  }

  // We don't call getStaticProps or getServerSideProps while generating
  // the fallback so make sure to set pageProps to an empty object
  if (isFallback) {
    props.pageProps = {}
  }

  // the response might be finished on the getInitialProps call
  if (isResSent(res) && !isSSG) return RenderResult.EMPTY

  // we preload the buildManifest for auto-export dynamic pages
  // to speed up hydrating query values
  let filteredBuildManifest = buildManifest
  if (isAutoExport && pageIsDynamic) {
    const page = denormalizePagePath(normalizePagePath(pathname))
    // This code would be much cleaner using `immer` and directly pushing into
    // the result from `getPageFiles`, we could maybe consider that in the
    // future.
    if (page in filteredBuildManifest.pages) {
      filteredBuildManifest = {
        ...filteredBuildManifest,
        pages: {
          ...filteredBuildManifest.pages,
          [page]: [
            ...filteredBuildManifest.pages[page],
            ...filteredBuildManifest.lowPriorityFiles.filter((f) =>
              f.includes('_buildManifest')
            ),
          ],
        },
        lowPriorityFiles: filteredBuildManifest.lowPriorityFiles.filter(
          (f) => !f.includes('_buildManifest')
        ),
      }
    }
  }

  const Body = ({ children }: { children: JSX.Element }) => {
    return <div id="__next">{children}</div>
  }

  const renderDocument = async () => {
    // For `Document`, there are two cases that we don't support:
    // 1. Using `Document.getInitialProps` in the Edge runtime.
    // 2. Using the class component `Document` with concurrent features.

    const BuiltinFunctionalDocument: DocumentType | undefined = (
      Document as any
    )[NEXT_BUILTIN_DOCUMENT]

    if (process.env.NEXT_RUNTIME === 'edge' && Document.getInitialProps) {
      // In the Edge runtime, `Document.getInitialProps` isn't supported.
      // We throw an error here if it's customized.
      if (BuiltinFunctionalDocument) {
        Document = BuiltinFunctionalDocument
      } else {
        throw new Error(
          '`getInitialProps` in Document component is not supported with the Edge Runtime.'
        )
      }
    }

    async function loadDocumentInitialProps(
      renderShell: (
        _App: AppType,
        _Component: NextComponentType
      ) => Promise<ReactDOMServerReadableStream>
    ) {
      const renderPage: RenderPage = async (
        options: ComponentsEnhancer = {}
      ): Promise<RenderPageResult> => {
        if (ctx.err && ErrorDebug) {
          // Always start rendering the shell even if there's an error.
          if (renderShell) {
            renderShell(App, Component)
          }

          const html = await renderToString(
            <Body>
              <ErrorDebug />
            </Body>
          )
          return { html, head }
        }

        if (dev && (props.router || props.Component)) {
          throw new Error(
            `'router' and 'Component' can not be returned in getInitialProps from _app.js https://nextjs.org/docs/messages/cant-override-next-props`
          )
        }

        const { App: EnhancedApp, Component: EnhancedComponent } =
          enhanceComponents(options, App, Component)

        const stream = await renderShell(EnhancedApp, EnhancedComponent)
        await stream.allReady
        const html = await streamToString(stream)

        return { html, head }
      }
      const documentCtx = { ...ctx, renderPage }
      const docProps: DocumentInitialProps = await loadGetInitialProps(
        Document,
        documentCtx
      )
      // the response might be finished on the getInitialProps call
      if (isResSent(res) && !isSSG) return null

      if (!docProps || typeof docProps.html !== 'string') {
        const message = `"${getDisplayName(
          Document
        )}.getInitialProps()" should resolve to an object with a "html" prop set with a valid html string`
        throw new Error(message)
      }

      return { docProps, documentCtx }
    }

    const renderContent = (_App: AppType, _Component: NextComponentType) => {
      const EnhancedApp = _App || App
      const EnhancedComponent = _Component || Component

      return ctx.err && ErrorDebug ? (
        <Body>
          <ErrorDebug />
        </Body>
      ) : (
        <Body>
          <AppContainerWithIsomorphicFiberStructure>
            {renderPageTree(EnhancedApp, EnhancedComponent, {
              ...props,
              router,
            })}
          </AppContainerWithIsomorphicFiberStructure>
        </Body>
      )
    }

    // Always using react concurrent rendering mode with required react version 18.x
    const renderShell = async (
      EnhancedApp: AppType,
      EnhancedComponent: NextComponentType
    ) => {
      const content = renderContent(EnhancedApp, EnhancedComponent)
      return await renderToInitialFizzStream({
        ReactDOMServer: ReactDOMServerPages,
        element: content,
      })
    }

    const hasDocumentGetInitialProps =
      process.env.NEXT_RUNTIME !== 'edge' && !!Document.getInitialProps

    // If it has getInitialProps, we will render the shell in `renderPage`.
    // Otherwise we do it right now.
    let documentInitialPropsRes:
      | {}
      | Awaited<ReturnType<typeof loadDocumentInitialProps>>

    const [rawStyledJsxInsertedHTML, content] = await Promise.all([
      renderToString(styledJsxInsertedHTML()),
      (async () => {
        if (hasDocumentGetInitialProps) {
          documentInitialPropsRes = await loadDocumentInitialProps(renderShell)
          if (documentInitialPropsRes === null) return null
          const { docProps } = documentInitialPropsRes as any
          return docProps.html
        } else {
          documentInitialPropsRes = {}
          const stream = await renderShell(App, Component)
          await stream.allReady
          return streamToString(stream)
        }
      })(),
    ])

    if (content === null) {
      return null
    }

    const contentHTML = rawStyledJsxInsertedHTML + content

    // @ts-ignore: documentInitialPropsRes is set
    const { docProps } = (documentInitialPropsRes as any) || {}
    const documentElement = (htmlProps: any) => {
      if (process.env.NEXT_RUNTIME === 'edge') {
        return (Document as any)()
      } else {
        return <Document {...htmlProps} {...docProps} />
      }
    }

    let styles
    if (hasDocumentGetInitialProps) {
      styles = docProps.styles
      head = docProps.head
    } else {
      styles = jsxStyleRegistry.styles()
      jsxStyleRegistry.flush()
    }

    return {
      contentHTML,
      documentElement,
      head,
      headTags: [],
      styles,
    }
  }

  getTracer().setRootSpanAttribute('next.route', renderOpts.page)
  const documentResult = await getTracer().trace(
    RenderSpan.renderDocument,
    {
      spanName: `render route (pages) ${renderOpts.page}`,
      attributes: {
        'next.route': renderOpts.page,
      },
    },
    async () => renderDocument()
  )
  if (!documentResult) {
    return new RenderResult(null, {
      metadata,
      contentType: HTML_CONTENT_TYPE_HEADER,
    })
  }

  const dynamicImportsIds = new Set<string | number>()
  const dynamicImports = new Set<string>()

  for (const mod of reactLoadableModules) {
    const manifestItem = reactLoadableManifest[mod]

    if (manifestItem) {
      dynamicImportsIds.add(manifestItem.id)
      manifestItem.files.forEach((item) => {
        dynamicImports.add(item)
      })
    }
  }

  const docComponentsRendered: DocumentProps['docComponentsRendered'] = {}

  const {
    assetPrefix,
    defaultLocale,
    disableOptimizedLoading,
    domainLocales,
    locale,
    locales,
  } = renderOpts
  const htmlProps: HtmlProps = {
    __NEXT_DATA__: {
      props, // The result of getInitialProps
      page: pathname, // The rendered page
      query, // querystring parsed / passed by the user
      buildId: sharedContext.buildId,
      assetPrefix: assetPrefix === '' ? undefined : assetPrefix, // send assetPrefix to the client side when configured, otherwise don't sent in the resulting HTML
      nextExport: nextExport === true ? true : undefined, // If this is a page exported by `next export`
      autoExport: isAutoExport === true ? true : undefined, // If this is an auto exported page
      isFallback,
      isExperimentalCompile,
      dynamicIds:
        dynamicImportsIds.size === 0
          ? undefined
          : Array.from(dynamicImportsIds),
      err: renderOpts.err ? serializeError(dev, renderOpts.err) : undefined, // Error if one happened, otherwise don't sent in the resulting HTML
      gsp: !!getStaticProps ? true : undefined, // whether the page is getStaticProps
      gssp: !!getServerSideProps ? true : undefined, // whether the page is getServerSideProps
      customServer: sharedContext.customServer,
      gip: hasPageGetInitialProps ? true : undefined, // whether the page has getInitialProps
      appGip: !defaultAppGetInitialProps ? true : undefined, // whether the _app has getInitialProps
      locale,
      locales,
      defaultLocale,
      domainLocales,
      isPreview: isPreview === true ? true : undefined,
      notFoundSrcPage: notFoundSrcPage && dev ? notFoundSrcPage : undefined,
    },
    nonce,
    buildManifest: filteredBuildManifest,
    docComponentsRendered,
    dangerousAsPath: router.asPath,
    isDevelopment: !!dev,
    dynamicImports: Array.from(dynamicImports),
    dynamicCssManifest: new Set(renderOpts.dynamicCssManifest || []),
    assetPrefix,
    // Only enabled in production as development mode has features relying on HMR (style injection for example)
    unstable_runtimeJS:
      process.env.NODE_ENV === 'production'
        ? pageConfig.unstable_runtimeJS
        : undefined,
    unstable_JsPreload: pageConfig.unstable_JsPreload,
    assetQueryString,
    scriptLoader,
    locale,
    disableOptimizedLoading,
    head: documentResult.head,
    headTags: documentResult.headTags,
    styles: documentResult.styles,
    crossOrigin: renderOpts.crossOrigin,
    optimizeCss: renderOpts.optimizeCss,
    nextConfigOutput: renderOpts.nextConfigOutput,
    nextScriptWorkers: renderOpts.nextScriptWorkers,
    runtime: globalRuntime,
    largePageDataBytes: renderOpts.largePageDataBytes,
    nextFontManifest: renderOpts.nextFontManifest,
    experimentalClientTraceMetadata:
      renderOpts.experimental.clientTraceMetadata,
  }

  const document = (
    <HtmlContext.Provider value={htmlProps}>
      {documentResult.documentElement(htmlProps)}
    </HtmlContext.Provider>
  )

  const documentHTML = await getTracer().trace(
    RenderSpan.renderToString,
    async () => renderToString(document)
  )

  if (process.env.NODE_ENV !== 'production') {
    const nonRenderedComponents = []
    const expectedDocComponents = ['Main', 'Head', 'NextScript', 'Html']

    for (const comp of expectedDocComponents) {
      if (!(docComponentsRendered as any)[comp]) {
        nonRenderedComponents.push(comp)
      }
    }

    if (nonRenderedComponents.length) {
      const missingComponentList = nonRenderedComponents
        .map((e) => `<${e} />`)
        .join(', ')
      const plural = nonRenderedComponents.length !== 1 ? 's' : ''
      console.warn(
        `Your custom Document (pages/_document) did not render all the required subcomponent${plural}.\n` +
          `Missing component${plural}: ${missingComponentList}\n` +
          'Read how to fix here: https://nextjs.org/docs/messages/missing-document-component'
      )
    }
  }

  const [renderTargetPrefix, renderTargetSuffix] = documentHTML.split(
    '<next-js-internal-body-render-target></next-js-internal-body-render-target>',
    2
  )

  let prefix = ''
  if (!documentHTML.startsWith(DOCTYPE)) {
    prefix += DOCTYPE
  }
  prefix += renderTargetPrefix

  const content = prefix + documentResult.contentHTML + renderTargetSuffix

  const optimizedHtml = await postProcessHTML(content, renderOpts)

  return new RenderResult(optimizedHtml, {
    metadata,
    contentType: HTML_CONTENT_TYPE_HEADER,
  })
}

export type PagesRender = (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts,
  sharedContext: PagesSharedContext,
  renderContext: PagesRenderContext
) => Promise<RenderResult>

export const renderToHTML: PagesRender = (
  req,
  res,
  pathname,
  query,
  renderOpts,
  sharedContext,
  renderContext
) => {
  return renderToHTMLImpl(
    req,
    res,
    pathname,
    query,
    renderOpts,
    renderOpts,
    sharedContext,
    renderContext
  )
}
