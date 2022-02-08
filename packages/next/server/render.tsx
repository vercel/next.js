import type { IncomingMessage, ServerResponse } from 'http'
import type { NextRouter } from '../shared/lib/router/router'
import type { HtmlProps } from '../shared/lib/html-context'
import type { DomainLocale } from './config'
import type {
  AppType,
  DocumentInitialProps,
  DocumentProps,
  DocumentContext,
  NextComponentType,
  RenderPage,
  RenderPageResult,
} from '../shared/lib/utils'
import type { ImageConfigComplete } from '../shared/lib/image-config'
import type { Redirect } from '../lib/load-custom-routes'
import type { NextApiRequestCookies, __ApiPreviewProps } from './api-utils'
import type { FontManifest } from './font-utils'
import type { LoadComponentsReturnType, ManifestItem } from './load-components'
import type { GetServerSideProps, GetStaticProps, PreviewData } from '../types'
import type { UnwrapPromise } from '../lib/coalesced-function'

import React from 'react'
import { ParsedUrlQuery, stringify as stringifyQuery } from 'querystring'
import { createFromReadableStream } from 'next/dist/compiled/react-server-dom-webpack'
import { renderToReadableStream } from 'next/dist/compiled/react-server-dom-webpack/writer.browser.server'
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
} from '../lib/constants'
import {
  SERVER_PROPS_ID,
  STATIC_PROPS_ID,
  STATIC_STATUS_PAGES,
} from '../shared/lib/constants'
import { isSerializableProps } from '../lib/is-serializable-props'
import { isInAmpMode } from '../shared/lib/amp'
import { AmpStateContext } from '../shared/lib/amp-context'
import { defaultHead } from '../shared/lib/head'
import { HeadManagerContext } from '../shared/lib/head-manager-context'
import Loadable from '../shared/lib/loadable'
import { LoadableContext } from '../shared/lib/loadable-context'
import { RouterContext } from '../shared/lib/router-context'
import { isDynamicRoute } from '../shared/lib/router/utils/is-dynamic'
import {
  ComponentsEnhancer,
  getDisplayName,
  isResSent,
  loadGetInitialProps,
} from '../shared/lib/utils'
import { HtmlContext } from '../shared/lib/html-context'
import { denormalizePagePath } from './denormalize-page-path'
import { normalizePagePath } from './normalize-page-path'
import { getRequestMeta, NextParsedUrlQuery } from './request-meta'
import {
  allowedStatusCodes,
  getRedirectStatus,
} from '../lib/load-custom-routes'
import RenderResult from './render-result'
import isError from '../lib/is-error'
import { readableStreamTee } from './web/utils'
import { ImageConfigContext } from '../shared/lib/image-config-context'
import { FlushEffectsContext } from '../shared/lib/flush-effects'

let optimizeAmp: typeof import('./optimize-amp').default
let getFontDefinitionFromManifest: typeof import('./font-utils').getFontDefinitionFromManifest
let tryGetPreviewData: typeof import('./api-utils/node').tryGetPreviewData
let warn: typeof import('../build/output/log').warn
let postProcess: typeof import('../shared/lib/post-process').default

const DOCTYPE = '<!DOCTYPE html>'

if (!process.browser) {
  require('./node-polyfill-web-streams')
  optimizeAmp = require('./optimize-amp').default
  getFontDefinitionFromManifest =
    require('./font-utils').getFontDefinitionFromManifest
  tryGetPreviewData = require('./api-utils/node').tryGetPreviewData
  warn = require('../build/output/log').warn
  postProcess = require('../shared/lib/post-process').default
} else {
  warn = console.warn.bind(console)
}

function noRouter() {
  const message =
    'No router instance found. you should only use "next/router" inside the client side of your app. https://nextjs.org/docs/messages/no-router-instance'
  throw new Error(message)
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
  locales?: string[]
  defaultLocale?: string
  domainLocales?: DomainLocale[]
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
    locales?: string[],
    defaultLocale?: string,
    domainLocales?: DomainLocale[],
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

function renderFlight(AppMod: any, Component: React.ComponentType, props: any) {
  const AppServer = AppMod.__next_rsc__
    ? (AppMod.default as React.ComponentType)
    : React.Fragment
  return (
    <AppServer>
      <Component {...props} />
    </AppServer>
  )
}

export type RenderOptsPartial = {
  buildId: string
  canonicalBase: string
  runtimeConfig?: { [key: string]: any }
  assetPrefix?: string
  err?: Error | null
  nextExport?: boolean
  dev?: boolean
  ampPath?: string
  ErrorDebug?: React.ComponentType<{ error: Error }>
  ampValidator?: (html: string, pathname: string) => Promise<void>
  ampSkipValidation?: boolean
  ampOptimizerConfig?: { [key: string]: any }
  isDataReq?: boolean
  params?: ParsedUrlQuery
  previewProps: __ApiPreviewProps
  basePath: string
  unstable_runtimeJS?: false
  unstable_JsPreload?: false
  optimizeFonts: boolean
  fontManifest?: FontManifest
  optimizeCss: any
  optimizeScripts?: {
    enablePartytown?: boolean
    partytownConfig?: any
  }
  devOnlyCacheBusterQueryString?: string
  resolvedUrl?: string
  resolvedAsPath?: string
  serverComponentManifest?: any
  renderServerComponentData?: boolean
  serverComponentProps?: any
  distDir?: string
  locale?: string
  locales?: string[]
  defaultLocale?: string
  domainLocales?: DomainLocale[]
  disableOptimizedLoading?: boolean
  supportsDynamicHTML?: boolean
  runtime?: 'nodejs' | 'edge'
  serverComponents?: boolean
  customServer?: boolean
  crossOrigin?: string
  images: ImageConfigComplete
  reactRoot: boolean
}

export type RenderOpts = LoadComponentsReturnType & RenderOptsPartial

const invalidKeysMsg = (methodName: string, invalidKeys: string[]) => {
  return (
    `Additional keys were returned from \`${methodName}\`. Properties intended for your component must be nested under the \`props\` key, e.g.:` +
    `\n\n\treturn { props: { title: 'My Title', content: '...' } }` +
    `\n\nKeys that need to be moved: ${invalidKeys.join(', ')}.` +
    `\nRead more: https://nextjs.org/docs/messages/invalid-getstaticprops-value`
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

const rscCache = new Map()

function createRSCHook() {
  return (
    writable: WritableStream<Uint8Array>,
    id: string,
    req: ReadableStream<Uint8Array>,
    bootstrap: boolean
  ) => {
    let entry = rscCache.get(id)
    if (!entry) {
      const [renderStream, forwardStream] = readableStreamTee(req)
      entry = createFromReadableStream(renderStream)
      rscCache.set(id, entry)

      let bootstrapped = false
      const forwardReader = forwardStream.getReader()
      const writer = writable.getWriter()
      function process() {
        forwardReader.read().then(({ done, value }) => {
          if (bootstrap && !bootstrapped) {
            bootstrapped = true
            writer.write(
              encodeText(
                `<script>(self.__next_s=self.__next_s||[]).push(${JSON.stringify(
                  [0, id]
                )})</script>`
              )
            )
          }
          if (done) {
            rscCache.delete(id)
            writer.close()
          } else {
            writer.write(
              encodeText(
                `<script>(self.__next_s=self.__next_s||[]).push(${JSON.stringify(
                  [1, id, decodeText(value)]
                )})</script>`
              )
            )
            process()
          }
        })
      }
      process()
    }
    return entry
  }
}

const useRSCResponse = createRSCHook()

// Create the wrapper component for a Flight stream.
function createServerComponentRenderer(
  OriginalComponent: React.ComponentType,
  AppMod: any,
  ComponentMod: any,
  {
    cachePrefix,
    transformStream,
    serverComponentManifest,
  }: {
    cachePrefix: string
    transformStream: TransformStream<Uint8Array, Uint8Array>
    serverComponentManifest: NonNullable<RenderOpts['serverComponentManifest']>
  }
) {
  // We need to expose the `__webpack_require__` API globally for
  // react-server-dom-webpack. This is a hack until we find a better way.
  // @ts-ignore
  globalThis.__webpack_require__ = ComponentMod.__next_rsc__.__webpack_require__

  const writable = transformStream.writable
  const ServerComponentWrapper = (props: any) => {
    const id = (React as any).useId()
    const reqStream: ReadableStream<Uint8Array> = renderToReadableStream(
      renderFlight(AppMod, OriginalComponent, props),
      serverComponentManifest
    )

    const response = useRSCResponse(
      writable,
      cachePrefix + ',' + id,
      reqStream,
      true
    )
    const root = response.readRoot()
    rscCache.delete(id)
    return root
  }

  const Component = (props: any) => {
    return <ServerComponentWrapper {...props} />
  }

  // Although it's not allowed to attach some static methods to Component,
  // we still re-assign all the component APIs to keep the behavior unchanged.
  for (const methodName of [
    'getInitialProps',
    'getStaticProps',
    'getServerSideProps',
    'getStaticPaths',
  ]) {
    const method = (OriginalComponent as any)[methodName]
    if (method) {
      ;(Component as any)[methodName] = method
    }
  }

  return Component
}

export async function renderToHTML(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts
): Promise<RenderResult | null> {
  // In dev we invalidate the cache by appending a timestamp to the resource URL.
  // This is a workaround to fix https://github.com/vercel/next.js/issues/5860
  // TODO: remove this workaround when https://bugs.webkit.org/show_bug.cgi?id=187726 is fixed.
  renderOpts.devOnlyCacheBusterQueryString = renderOpts.dev
    ? renderOpts.devOnlyCacheBusterQueryString || `?ts=${Date.now()}`
    : ''

  // don't modify original query object
  query = Object.assign({}, query)

  const {
    err,
    dev = false,
    ampPath = '',
    App,
    Document,
    pageConfig = {},
    buildManifest,
    fontManifest,
    reactLoadableManifest,
    ErrorDebug,
    getStaticProps,
    getStaticPaths,
    getServerSideProps,
    serverComponentManifest,
    serverComponentProps,
    isDataReq,
    params,
    previewProps,
    basePath,
    devOnlyCacheBusterQueryString,
    supportsDynamicHTML,
    images,
    reactRoot,
    runtime,
    ComponentMod,
    AppMod,
  } = renderOpts

  const hasConcurrentFeatures = !!runtime

  const OriginalComponent = renderOpts.Component

  // We don't need to opt-into the flight inlining logic if the page isn't a RSC.
  const isServerComponent =
    !!serverComponentManifest &&
    hasConcurrentFeatures &&
    ComponentMod.__next_rsc__

  let Component: React.ComponentType<{}> | ((props: any) => JSX.Element) =
    renderOpts.Component
  let serverComponentsInlinedTransformStream: TransformStream<
    Uint8Array,
    Uint8Array
  > | null = null

  if (isServerComponent) {
    serverComponentsInlinedTransformStream = new TransformStream()
    const search = stringifyQuery(query)
    Component = createServerComponentRenderer(
      OriginalComponent,
      AppMod,
      ComponentMod,
      {
        cachePrefix: pathname + (search ? `?${search}` : ''),
        transformStream: serverComponentsInlinedTransformStream,
        serverComponentManifest,
      }
    )
  }

  const getFontDefinition = (url: string): string => {
    if (fontManifest) {
      return getFontDefinitionFromManifest(url, fontManifest)
    }
    return ''
  }

  let { renderServerComponentData } = renderOpts
  if (isServerComponent && query.__flight__) {
    renderServerComponentData = true
    delete query.__flight__
  }

  const callMiddleware = async (method: string, args: any[], props = false) => {
    let results: any = props ? {} : []

    if ((Document as any)[`${method}Middleware`]) {
      let middlewareFunc = await (Document as any)[`${method}Middleware`]
      middlewareFunc = middlewareFunc.default || middlewareFunc

      const curResults = await middlewareFunc(...args)
      if (props) {
        for (const result of curResults) {
          results = {
            ...results,
            ...result,
          }
        }
      } else {
        results = curResults
      }
    }
    return results
  }

  const headTags = (...args: any) => callMiddleware('headTags', args)

  const isFallback = !!query.__nextFallback
  const notFoundSrcPage = query.__nextNotFoundSrcPage
  delete query.__nextFallback
  delete query.__nextLocale
  delete query.__nextDefaultLocale
  delete query.__nextIsNotFound

  const isSSG = !!getStaticProps
  const isBuildTimeSSG = isSSG && renderOpts.nextExport
  const defaultAppGetInitialProps =
    App.getInitialProps === (App as any).origGetInitialProps

  const hasPageGetInitialProps = !!(Component as any)?.getInitialProps

  const pageIsDynamic = isDynamicRoute(pathname)

  const isAutoExport =
    !hasPageGetInitialProps &&
    defaultAppGetInitialProps &&
    !isSSG &&
    !getServerSideProps &&
    !hasConcurrentFeatures

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

  if (hasPageGetInitialProps && isSSG) {
    throw new Error(SSG_GET_INITIAL_PROPS_CONFLICT + ` ${pathname}`)
  }

  if (hasPageGetInitialProps && getServerSideProps) {
    throw new Error(SERVER_PROPS_GET_INIT_PROPS_CONFLICT + ` ${pathname}`)
  }

  if (getServerSideProps && isSSG) {
    throw new Error(SERVER_PROPS_SSG_CONFLICT + ` ${pathname}`)
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
    const { isValidElementType } = require('next/dist/compiled/react-is')
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
      query = {
        ...(query.amp
          ? {
              amp: query.amp,
            }
          : {}),
      }
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
  }

  await Loadable.preloadAll() // Make sure all dynamic imports are loaded

  let isPreview
  let previewData: PreviewData

  if ((isSSG || getServerSideProps) && !isFallback && !process.browser) {
    // Reads of this are cached on the `req` object, so this should resolve
    // instantly. There's no need to pass this data down from a previous
    // invoke, where we'd have to consider server & serverless.
    previewData = tryGetPreviewData(req, res, previewProps)
    isPreview = previewData !== false
  }

  // url will always be set
  const routerIsReady = !!(
    getServerSideProps ||
    hasPageGetInitialProps ||
    (!defaultAppGetInitialProps && !isSSG)
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
    getRequestMeta(req, '__nextIsLocaleDomain')
  )
  const jsxStyleRegistry = createStyleRegistry()
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
          <App {...props} Component={Component} router={router} />
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

      const { html, head } = await docCtx.renderPage({ enhanceApp })
      const styles = jsxStyleRegistry.styles({ nonce: options.nonce })
      return { html, head, styles }
    },
  }
  let props: any

  const ampState = {
    ampFirst: pageConfig.amp === true,
    hasQuery: Boolean(query.amp),
    hybrid: pageConfig.amp === 'hybrid',
  }

  // Disable AMP under the web environment
  const inAmpMode = !process.browser && isInAmpMode(ampState)

  const reactLoadableModules: string[] = []

  let head: JSX.Element[] = defaultHead(inAmpMode)

  let scriptLoader: any = {}
  const nextExport =
    !isSSG && (renderOpts.nextExport || (dev && (isAutoExport || isFallback)))

  const styledJsxFlushEffect = () => {
    const styles = jsxStyleRegistry.styles()
    jsxStyleRegistry.flush()
    return <>{styles}</>
  }

  let flushEffects: Array<() => React.ReactNode> | null = null
  function FlushEffectContainer({ children }: { children: JSX.Element }) {
    // If the client tree suspends, this component will be rendered multiple
    // times before we flush. To ensure we don't call old callbacks corresponding
    // to a previous render, we clear any registered callbacks whenever we render.
    flushEffects = null

    const flushEffectsImpl = React.useCallback(
      (callbacks: Array<() => React.ReactNode>) => {
        if (flushEffects) {
          throw new Error(
            'The `useFlushEffects` hook cannot be used more than once.' +
              '\nRead more: https://nextjs.org/docs/messages/multiple-flush-effects'
          )
        }
        flushEffects = callbacks
      },
      []
    )

    return (
      <FlushEffectsContext.Provider value={flushEffectsImpl}>
        {children}
      </FlushEffectsContext.Provider>
    )
  }

  const AppContainer = ({ children }: { children: JSX.Element }) => (
    <FlushEffectContainer>
      <RouterContext.Provider value={router}>
        <AmpStateContext.Provider value={ampState}>
          <HeadManagerContext.Provider
            value={{
              updateHead: (state) => {
                head = state
              },
              updateScripts: (scripts) => {
                scriptLoader = scripts
              },
              scripts: {},
              mountedInstances: new Set(),
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
        </AmpStateContext.Provider>
      </RouterContext.Provider>
    </FlushEffectContainer>
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
            {/* <ReactDevOverlay/> */}
            {dev ? (
              <>
                {children}
                <Noop />
              </>
            ) : (
              children
            )}
            {/* <RouteAnnouncer/> */}
            <Noop />
          </>
        </AppContainer>
      </>
    )
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
    let data: UnwrapPromise<ReturnType<GetStaticProps>>

    try {
      data = await getStaticProps!({
        ...(pageIsDynamic ? { params: query as ParsedUrlQuery } : undefined),
        ...(isPreview
          ? { preview: true, previewData: previewData }
          : undefined),
        locales: renderOpts.locales,
        locale: renderOpts.locale,
        defaultLocale: renderOpts.defaultLocale,
      })
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

      ;(renderOpts as any).isNotFound = true
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
      ;(renderOpts as any).isRedirect = true
    }

    if (
      (dev || isBuildTimeSSG) &&
      !(renderOpts as any).isNotFound &&
      !isSerializableProps(pathname, 'getStaticProps', (data as any).props)
    ) {
      // this fn should throw an error instead of ever returning `false`
      throw new Error(
        'invariant: getStaticProps did not return valid props. Please report this.'
      )
    }

    if ('revalidate' in data) {
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
        } else if (data.revalidate > 31536000) {
          // if it's greater than a year for some reason error
          console.warn(
            `Warning: A page's revalidate option was set to more than a year for ${req.url}. This may have been done in error.` +
              `\nTo only run getStaticProps at build-time and not revalidate at runtime, you can set \`revalidate\` to \`false\`!`
          )
        }
      } else if (data.revalidate === true) {
        // When enabled, revalidate after 1 second. This value is optimal for
        // the most up-to-date page possible, but without a 1-to-1
        // request-refresh ratio.
        data.revalidate = 1
      } else if (
        data.revalidate === false ||
        typeof data.revalidate === 'undefined'
      ) {
        // By default, we never revalidate.
        data.revalidate = false
      } else {
        throw new Error(
          `A page's revalidate option must be seconds expressed as a natural number. Mixed numbers and strings cannot be used. Received '${JSON.stringify(
            data.revalidate
          )}' for ${req.url}`
        )
      }
    } else {
      // By default, we never revalidate.
      ;(data as any).revalidate = false
    }

    props.pageProps = Object.assign(
      {},
      props.pageProps,
      'props' in data ? data.props : undefined
    )

    // pass up revalidate and props for export
    // TODO: change this to a different passing mechanism
    ;(renderOpts as any).revalidate =
      'revalidate' in data ? data.revalidate : undefined
    ;(renderOpts as any).pageData = props

    // this must come after revalidate is added to renderOpts
    if ((renderOpts as any).isNotFound) {
      return null
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
        get: function (obj, prop, receiver) {
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
          const value = Reflect.get(obj, prop, receiver)

          // since ServerResponse uses internal fields which
          // proxy can't map correctly we need to ensure functions
          // are bound correctly while being proxied
          if (typeof value === 'function') {
            return value.bind(obj)
          }
          return value
        },
      })
    }

    try {
      data = await getServerSideProps({
        req: req as IncomingMessage & {
          cookies: NextApiRequestCookies
        },
        res: resOrProxy,
        query,
        resolvedUrl: renderOpts.resolvedUrl as string,
        ...(pageIsDynamic ? { params: params as ParsedUrlQuery } : undefined),
        ...(previewData !== false
          ? { preview: true, previewData: previewData }
          : undefined),
        locales: renderOpts.locales,
        locale: renderOpts.locale,
        defaultLocale: renderOpts.defaultLocale,
      })
      canAccessRes = false
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

      ;(renderOpts as any).isNotFound = true
      return null
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
      ;(renderOpts as any).isRedirect = true
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
    ;(renderOpts as any).pageData = props
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
  if ((isDataReq && !isSSG) || (renderOpts as any).isRedirect) {
    return RenderResult.fromStatic(JSON.stringify(props))
  }

  // We don't call getStaticProps or getServerSideProps while generating
  // the fallback so make sure to set pageProps to an empty object
  if (isFallback) {
    props.pageProps = {}
  }

  // Pass router to the Server Component as a temporary workaround.
  if (isServerComponent) {
    props.pageProps = Object.assign({}, props.pageProps, { router })
  }

  // the response might be finished on the getInitialProps call
  if (isResSent(res) && !isSSG) return null

  if (renderServerComponentData) {
    const stream: ReadableStream<Uint8Array> = renderToReadableStream(
      renderFlight(AppMod, OriginalComponent, {
        ...props.pageProps,
        ...serverComponentProps,
      }),
      serverComponentManifest
    )

    return new RenderResult(
      pipeThrough(stream, createBufferedTransformStream())
    )
  }

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
    return inAmpMode ? children : <div id="__next">{children}</div>
  }

  const ReactDOMServer = reactRoot
    ? require('react-dom/server.browser')
    : require('react-dom/server')

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
  const renderDocument = async () => {
    if (runtime === 'edge' && Document.getInitialProps) {
      // In the Edge runtime, Document.getInitialProps isn't supported.
      throw new Error(
        '`getInitialProps` in Document component is not supported with the Edge Runtime.'
      )
    }

    if (!runtime && Document.getInitialProps) {
      const renderPage: RenderPage = (
        options: ComponentsEnhancer = {}
      ): RenderPageResult | Promise<RenderPageResult> => {
        if (ctx.err && ErrorDebug) {
          const html = ReactDOMServer.renderToString(
            <Body>
              <ErrorDebug error={ctx.err} />
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

        const html = ReactDOMServer.renderToString(
          <Body>
            <AppContainerWithIsomorphicFiberStructure>
              <EnhancedApp
                Component={EnhancedComponent}
                router={router}
                {...props}
              />
            </AppContainerWithIsomorphicFiberStructure>
          </Body>
        )
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

      return {
        bodyResult: (suffix: string) =>
          streamFromArray([docProps.html, suffix]),
        documentElement: (htmlProps: HtmlProps) => (
          <Document {...htmlProps} {...docProps} />
        ),
        head: docProps.head,
        headTags: await headTags(documentCtx),
        styles: docProps.styles,
      }
    } else {
      let bodyResult

      const renderContent = () => {
        return ctx.err && ErrorDebug ? (
          <Body>
            <ErrorDebug error={ctx.err} />
          </Body>
        ) : (
          <Body>
            <AppContainerWithIsomorphicFiberStructure>
              {renderOpts.serverComponents && AppMod.__next_rsc__ ? (
                <Component {...props.pageProps} router={router} />
              ) : (
                <App {...props} Component={Component} router={router} />
              )}
            </AppContainerWithIsomorphicFiberStructure>
          </Body>
        )
      }

      if (reactRoot) {
        bodyResult = async (suffix: string) => {
          // this must be called inside bodyResult so appWrappers is
          // up to date when getWrappedApp is called

          const content = renderContent()
          const flushEffectHandler = async () => {
            const allFlushEffects = [
              styledJsxFlushEffect,
              ...(flushEffects || []),
            ]
            const flushEffectStream = await renderToStream({
              ReactDOMServer,
              element: (
                <>
                  {allFlushEffects.map((flushEffect, i) => (
                    <React.Fragment key={i}>{flushEffect()}</React.Fragment>
                  ))}
                </>
              ),
              generateStaticHTML: true,
            })

            const flushed = await streamToString(flushEffectStream)
            return flushed
          }

          return await renderToStream({
            ReactDOMServer,
            element: content,
            suffix,
            dataStream: serverComponentsInlinedTransformStream?.readable,
            generateStaticHTML: generateStaticHTML || !hasConcurrentFeatures,
            flushEffectHandler,
          })
        }
      } else {
        const content = renderContent()
        // for non-concurrent rendering we need to ensure App is rendered
        // before _document so that updateHead is called/collected before
        // rendering _document's head
        const result = ReactDOMServer.renderToString(content)
        bodyResult = (suffix: string) => streamFromArray([result, suffix])
      }

      const styles = jsxStyleRegistry.styles()
      jsxStyleRegistry.flush()

      return {
        bodyResult,
        documentElement: () => (Document as any)(),
        head,
        headTags: [],
        styles,
      }
    }
  }

  const documentResult = await renderDocument()
  if (!documentResult) {
    return null
  }

  const dynamicImportsIds = new Set<string | number>()
  const dynamicImports = new Set<string>()

  for (const mod of reactLoadableModules) {
    const manifestItem: ManifestItem = reactLoadableManifest[mod]

    if (manifestItem) {
      dynamicImportsIds.add(manifestItem.id)
      manifestItem.files.forEach((item) => {
        dynamicImports.add(item)
      })
    }
  }

  const hybridAmp = ampState.hybrid
  const docComponentsRendered: DocumentProps['docComponentsRendered'] = {}

  const {
    assetPrefix,
    buildId,
    customServer,
    defaultLocale,
    disableOptimizedLoading,
    domainLocales,
    locale,
    locales,
    runtimeConfig,
  } = renderOpts
  const htmlProps: HtmlProps = {
    __NEXT_DATA__: {
      props, // The result of getInitialProps
      page: pathname, // The rendered page
      query, // querystring parsed / passed by the user
      buildId, // buildId is used to facilitate caching of page bundles, we send it to the client so that pageloader knows where to load bundles
      assetPrefix: assetPrefix === '' ? undefined : assetPrefix, // send assetPrefix to the client side when configured, otherwise don't sent in the resulting HTML
      runtimeConfig, // runtimeConfig if provided, otherwise don't sent in the resulting HTML
      nextExport: nextExport === true ? true : undefined, // If this is a page exported by `next export`
      autoExport: isAutoExport === true ? true : undefined, // If this is an auto exported page
      isFallback,
      dynamicIds:
        dynamicImportsIds.size === 0
          ? undefined
          : Array.from(dynamicImportsIds),
      err: renderOpts.err ? serializeError(dev, renderOpts.err) : undefined, // Error if one happened, otherwise don't sent in the resulting HTML
      gsp: !!getStaticProps ? true : undefined, // whether the page is getStaticProps
      gssp: !!getServerSideProps ? true : undefined, // whether the page is getServerSideProps
      rsc: isServerComponent ? true : undefined, // whether the page is a server components page
      customServer, // whether the user is using a custom server
      gip: hasPageGetInitialProps ? true : undefined, // whether the page has getInitialProps
      appGip: !defaultAppGetInitialProps ? true : undefined, // whether the _app has getInitialProps
      locale,
      locales,
      defaultLocale,
      domainLocales,
      isPreview: isPreview === true ? true : undefined,
      notFoundSrcPage: notFoundSrcPage && dev ? notFoundSrcPage : undefined,
    },
    buildManifest: filteredBuildManifest,
    docComponentsRendered,
    dangerousAsPath: router.asPath,
    canonicalBase:
      !renderOpts.ampPath && getRequestMeta(req, '__nextStrippedLocale')
        ? `${renderOpts.canonicalBase || ''}/${renderOpts.locale}`
        : renderOpts.canonicalBase,
    ampPath,
    inAmpMode,
    isDevelopment: !!dev,
    hybridAmp,
    dynamicImports: Array.from(dynamicImports),
    assetPrefix,
    // Only enabled in production as development mode has features relying on HMR (style injection for example)
    unstable_runtimeJS:
      process.env.NODE_ENV === 'production'
        ? pageConfig.unstable_runtimeJS
        : undefined,
    unstable_JsPreload: pageConfig.unstable_JsPreload,
    devOnlyCacheBusterQueryString,
    scriptLoader,
    locale,
    disableOptimizedLoading,
    head: documentResult.head,
    headTags: documentResult.headTags,
    styles: documentResult.styles,
    crossOrigin: renderOpts.crossOrigin,
    optimizeCss: renderOpts.optimizeCss,
    optimizeFonts: renderOpts.optimizeFonts,
    optimizeScripts: renderOpts.optimizeScripts,
    runtime,
  }

  const document = (
    <AmpStateContext.Provider value={ampState}>
      <HtmlContext.Provider value={htmlProps}>
        {documentResult.documentElement(htmlProps)}
      </HtmlContext.Provider>
    </AmpStateContext.Provider>
  )

  let documentHTML: string
  if (hasConcurrentFeatures) {
    const documentStream = await renderToStream({
      ReactDOMServer,
      element: document,
      generateStaticHTML: true,
    })
    documentHTML = await streamToString(documentStream)
  } else {
    documentHTML = ReactDOMServer.renderToStaticMarkup(document)
  }

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
    '<next-js-internal-body-render-target></next-js-internal-body-render-target>'
  )

  const prefix: Array<string> = []
  if (!documentHTML.startsWith(DOCTYPE)) {
    prefix.push(DOCTYPE)
  }
  prefix.push(renderTargetPrefix)
  if (inAmpMode) {
    prefix.push('<!-- __NEXT_DATA__ -->')
  }

  let streams = [
    streamFromArray(prefix),
    await documentResult.bodyResult(renderTargetSuffix),
  ]

  const postProcessors: Array<((html: string) => Promise<string>) | null> = (
    generateStaticHTML
      ? [
          inAmpMode
            ? async (html: string) => {
                html = await optimizeAmp(html, renderOpts.ampOptimizerConfig)
                if (!renderOpts.ampSkipValidation && renderOpts.ampValidator) {
                  await renderOpts.ampValidator(html, pathname)
                }
                return html
              }
            : null,
          !process.browser && process.env.__NEXT_OPTIMIZE_FONTS
            ? async (html: string) => {
                return await postProcess(
                  html,
                  { getFontDefinition },
                  {
                    optimizeFonts: renderOpts.optimizeFonts,
                  }
                )
              }
            : null,
          !process.browser && renderOpts.optimizeCss
            ? async (html: string) => {
                // eslint-disable-next-line import/no-extraneous-dependencies
                const Critters = require('critters')
                const cssOptimizer = new Critters({
                  ssrMode: true,
                  reduceInlineStyles: false,
                  path: renderOpts.distDir,
                  publicPath: `${renderOpts.assetPrefix}/_next/`,
                  preload: 'media',
                  fonts: false,
                  ...renderOpts.optimizeCss,
                })
                return await cssOptimizer.process(html)
              }
            : null,
          inAmpMode || hybridAmp
            ? async (html: string) => {
                return html.replace(/&amp;amp=1/g, '&amp=1')
              }
            : null,
        ]
      : []
  ).filter(Boolean)

  if (generateStaticHTML || postProcessors.length > 0) {
    let html = await streamToString(chainStreams(streams))
    for (const postProcessor of postProcessors) {
      if (postProcessor) {
        html = await postProcessor(html)
      }
    }
    return new RenderResult(html)
  }

  return new RenderResult(chainStreams(streams))
}

function errorToJSON(err: Error) {
  return {
    name: err.name,
    message: err.message,
    stack: err.stack,
    middleware: (err as any).middleware,
  }
}

function serializeError(
  dev: boolean | undefined,
  err: Error
): Error & { statusCode?: number } {
  if (dev) {
    return errorToJSON(err)
  }

  return {
    name: 'Internal Server Error.',
    message: '500 - Internal Server Error.',
    statusCode: 500,
  }
}

function createTransformStream<Input, Output>({
  flush,
  transform,
}: {
  flush?: (
    controller: TransformStreamDefaultController<Output>
  ) => Promise<void> | void
  transform?: (
    chunk: Input,
    controller: TransformStreamDefaultController<Output>
  ) => Promise<void> | void
}): TransformStream<Input, Output> {
  const source = new TransformStream()
  const sink = new TransformStream()
  const reader = source.readable.getReader()
  const writer = sink.writable.getWriter()

  const controller = {
    enqueue(chunk: Output) {
      writer.write(chunk)
    },

    error(reason: Error) {
      writer.abort(reason)
      reader.cancel()
    },

    terminate() {
      writer.close()
      reader.cancel()
    },

    get desiredSize() {
      return writer.desiredSize
    },
  }

  ;(async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          const maybePromise = flush?.(controller)
          if (maybePromise) {
            await maybePromise
          }
          writer.close()
          return
        }

        if (transform) {
          const maybePromise = transform(value, controller)
          if (maybePromise) {
            await maybePromise
          }
        } else {
          controller.enqueue(value)
        }
      }
    } catch (err) {
      writer.abort(err)
    }
  })()

  return {
    readable: sink.readable,
    writable: source.writable,
  }
}

function createBufferedTransformStream(): TransformStream<
  Uint8Array,
  Uint8Array
> {
  let bufferedString = ''
  let pendingFlush: Promise<void> | null = null

  const flushBuffer = (controller: TransformStreamDefaultController) => {
    if (!pendingFlush) {
      pendingFlush = new Promise((resolve) => {
        setTimeout(() => {
          controller.enqueue(encodeText(bufferedString))
          bufferedString = ''
          pendingFlush = null
          resolve()
        }, 0)
      })
    }
    return pendingFlush
  }

  return createTransformStream({
    transform(chunk, controller) {
      bufferedString += decodeText(chunk)
      flushBuffer(controller)
    },

    flush() {
      if (pendingFlush) {
        return pendingFlush
      }
    },
  })
}

function createFlushEffectStream(
  handleFlushEffect: () => Promise<string>
): TransformStream<Uint8Array, Uint8Array> {
  return createTransformStream({
    async transform(chunk, controller) {
      const extraChunk = await handleFlushEffect()
      // those should flush together at once
      controller.enqueue(encodeText(extraChunk + decodeText(chunk)))
    },
  })
}

async function renderToStream({
  ReactDOMServer,
  element,
  suffix,
  dataStream,
  generateStaticHTML,
  flushEffectHandler,
}: {
  ReactDOMServer: typeof import('react-dom/server')
  element: React.ReactElement
  suffix?: string
  dataStream?: ReadableStream<Uint8Array>
  generateStaticHTML: boolean
  flushEffectHandler?: () => Promise<string>
}): Promise<ReadableStream<Uint8Array>> {
  const closeTag = '</body></html>'
  const suffixUnclosed = suffix ? suffix.split(closeTag)[0] : null
  const renderStream: ReadableStream<Uint8Array> & {
    allReady?: Promise<void>
  } = await (ReactDOMServer as any).renderToReadableStream(element)

  if (generateStaticHTML) {
    await renderStream.allReady
  }

  const transforms: Array<TransformStream<Uint8Array, Uint8Array>> = [
    createBufferedTransformStream(),
    flushEffectHandler ? createFlushEffectStream(flushEffectHandler) : null,
    suffixUnclosed != null ? createPrefixStream(suffixUnclosed) : null,
    dataStream ? createInlineDataStream(dataStream) : null,
    suffixUnclosed != null ? createSuffixStream(closeTag) : null,
  ].filter(Boolean) as any

  return transforms.reduce(
    (readable, transform) => pipeThrough(readable, transform),
    renderStream
  )
}

function encodeText(input: string) {
  return new TextEncoder().encode(input)
}

function decodeText(input?: Uint8Array) {
  return new TextDecoder().decode(input)
}

function createSuffixStream(
  suffix: string
): TransformStream<Uint8Array, Uint8Array> {
  return createTransformStream({
    flush(controller) {
      if (suffix) {
        controller.enqueue(encodeText(suffix))
      }
    },
  })
}

function createPrefixStream(
  prefix: string
): TransformStream<Uint8Array, Uint8Array> {
  let prefixFlushed = false
  let prefixPrefixFlushFinished: Promise<void> | null = null
  return createTransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk)
      if (!prefixFlushed && prefix) {
        prefixFlushed = true
        prefixPrefixFlushFinished = new Promise((res) => {
          // NOTE: streaming flush
          // Enqueue prefix part before the major chunks are enqueued so that
          // prefix won't be flushed too early to interrupt the data stream
          setTimeout(() => {
            controller.enqueue(encodeText(prefix))
            res()
          })
        })
      }
    },
    flush(controller) {
      if (prefixPrefixFlushFinished) return prefixPrefixFlushFinished
      if (!prefixFlushed && prefix) {
        prefixFlushed = true
        controller.enqueue(encodeText(prefix))
      }
    },
  })
}

function createInlineDataStream(
  dataStream: ReadableStream<Uint8Array>
): TransformStream<Uint8Array, Uint8Array> {
  let dataStreamFinished: Promise<void> | null = null
  return createTransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk)

      if (!dataStreamFinished) {
        const dataStreamReader = dataStream.getReader()

        // NOTE: streaming flush
        // We are buffering here for the inlined data stream because the
        // "shell" stream might be chunkenized again by the underlying stream
        // implementation, e.g. with a specific high-water mark. To ensure it's
        // the safe timing to pipe the data stream, this extra tick is
        // necessary.
        dataStreamFinished = new Promise((res) =>
          setTimeout(async () => {
            try {
              while (true) {
                const { done, value } = await dataStreamReader.read()
                if (done) {
                  return res()
                }
                controller.enqueue(value)
              }
            } catch (err) {
              controller.error(err)
            }
            res()
          }, 0)
        )
      }
    },
    flush() {
      if (dataStreamFinished) {
        return dataStreamFinished
      }
    },
  })
}

function pipeTo<T>(
  readable: ReadableStream<T>,
  writable: WritableStream<T>,
  options?: { preventClose: boolean }
) {
  let resolver: () => void
  const promise = new Promise<void>((resolve) => (resolver = resolve))

  const reader = readable.getReader()
  const writer = writable.getWriter()
  function process() {
    reader.read().then(({ done, value }) => {
      if (done) {
        if (options?.preventClose) {
          writer.releaseLock()
        } else {
          writer.close()
        }
        resolver()
      } else {
        writer.write(value)
        process()
      }
    })
  }
  process()
  return promise
}

function pipeThrough<Input, Output>(
  readable: ReadableStream<Input>,
  transformStream: TransformStream<Input, Output>
) {
  pipeTo(readable, transformStream.writable)
  return transformStream.readable
}

function chainStreams<T>(streams: ReadableStream<T>[]): ReadableStream<T> {
  const { readable, writable } = new TransformStream()

  let promise = Promise.resolve()
  for (let i = 0; i < streams.length; ++i) {
    promise = promise.then(() =>
      pipeTo(streams[i], writable, {
        preventClose: i + 1 < streams.length,
      })
    )
  }

  return readable
}

function streamFromArray(strings: string[]): ReadableStream<Uint8Array> {
  // Note: we use a TransformStream here instead of instantiating a ReadableStream
  // because the built-in ReadableStream polyfill runs strings through TextEncoder.
  const { readable, writable } = new TransformStream()

  const writer = writable.getWriter()
  strings.forEach((str) => writer.write(encodeText(str)))
  writer.close()

  return readable
}

async function streamToString(
  stream: ReadableStream<Uint8Array>
): Promise<string> {
  const reader = stream.getReader()
  let bufferedString = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      return bufferedString
    }

    bufferedString += decodeText(value)
  }
}
