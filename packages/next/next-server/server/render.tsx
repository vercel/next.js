import { IncomingMessage, ServerResponse } from 'http'
import { ParsedUrlQuery } from 'querystring'
import React from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import { NextRouter } from '../lib/router/router'
import mitt, { MittEmitter } from '../lib/mitt'
import {
  loadGetInitialProps,
  isResSent,
  getDisplayName,
  ComponentsEnhancer,
  RenderPage,
  DocumentInitialProps,
  NextComponentType,
  DocumentType,
  AppType,
  NextPageContext,
} from '../lib/utils'
import Head, { defaultHead } from '../lib/head'
// @ts-ignore types will be added later as it's an internal module
import Loadable from '../lib/loadable'
import { DataManagerContext } from '../lib/data-manager-context'
import { LoadableContext } from '../lib/loadable-context'
import { RouterContext } from '../lib/router-context'
import { DataManager } from '../lib/data-manager'
import { getPageFiles, BuildManifest } from './get-page-files'
import { AmpStateContext } from '../lib/amp-context'
import optimizeAmp from './optimize-amp'
import { isInAmpMode } from '../lib/amp'
// Uses a module path because of the compiled output directory location
import { PageConfig } from 'next/types'
import { isDynamicRoute } from '../lib/router/utils/is-dynamic'
import { SPR_GET_INITIAL_PROPS_CONFLICT } from '../../lib/constants'
import { AMP_RENDER_TARGET } from '../lib/constants'

export type ManifestItem = {
  id: number | string
  name: string
  file: string
  publicPath: string
}

type ReactLoadableManifest = { [moduleId: string]: ManifestItem[] }

function noRouter() {
  const message =
    'No router instance found. you should only use "next/router" inside the client side of your app. https://err.sh/zeit/next.js/no-router-instance'
  throw new Error(message)
}

class ServerRouter implements NextRouter {
  route: string
  pathname: string
  query: ParsedUrlQuery
  asPath: string
  events: any
  // TODO: Remove in the next major version, as this would mean the user is adding event listeners in server-side `render` method
  static events: MittEmitter = mitt()

  constructor(pathname: string, query: ParsedUrlQuery, as: string) {
    this.route = pathname.replace(/\/$/, '') || '/'
    this.pathname = pathname
    this.query = query
    this.asPath = as
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

function render(
  renderElementToString: (element: React.ReactElement<any>) => string,
  element: React.ReactElement<any>,
  ampMode: any
): { html: string; head: React.ReactElement[] } {
  let html
  let head

  try {
    html = renderElementToString(element)
  } finally {
    head = Head.rewind() || defaultHead(isInAmpMode(ampMode))
  }

  return { html, head }
}

type RenderOpts = {
  documentMiddlewareEnabled: boolean
  ampBindInitData: boolean
  staticMarkup: boolean
  buildId: string
  canonicalBase: string
  runtimeConfig?: { [key: string]: any }
  dangerousAsPath: string
  assetPrefix?: string
  hasCssMode: boolean
  err?: Error | null
  autoExport?: boolean
  nextExport?: boolean
  dev?: boolean
  ampMode?: any
  ampPath?: string
  dataOnly?: boolean
  inAmpMode?: boolean
  hybridAmp?: boolean
  buildManifest: BuildManifest
  reactLoadableManifest: ReactLoadableManifest
  pageConfig: PageConfig
  Component: React.ComponentType
  Document: DocumentType
  DocumentMiddleware: (ctx: NextPageContext) => void
  App: AppType
  ErrorDebug?: React.ComponentType<{ error: Error }>
  ampValidator?: (html: string, pathname: string) => Promise<void>
  unstable_getStaticProps?: (params: {
    params: any | undefined
  }) => {
    props: any
    revalidate?: number | boolean
  }
  unstable_getStaticPaths?: () => void
}

function renderDocument(
  Document: DocumentType,
  {
    dataManagerData,
    props,
    docProps,
    pathname,
    query,
    buildId,
    canonicalBase,
    assetPrefix,
    runtimeConfig,
    nextExport,
    autoExport,
    dynamicImportsIds,
    dangerousAsPath,
    hasCssMode,
    err,
    dev,
    ampPath,
    ampState,
    inAmpMode,
    hybridAmp,
    staticMarkup,
    devFiles,
    files,
    polyfillFiles,
    dynamicImports,
    htmlProps,
    bodyTags,
    headTags,
  }: RenderOpts & {
    dataManagerData: string
    props: any
    docProps: DocumentInitialProps
    pathname: string
    query: ParsedUrlQuery
    dangerousAsPath: string
    ampState: any
    ampPath: string
    inAmpMode: boolean
    hybridAmp: boolean
    dynamicImportsIds: string[]
    dynamicImports: ManifestItem[]
    files: string[]
    devFiles: string[]
    polyfillFiles: string[]
    htmlProps: any
    bodyTags: any
    headTags: any
  }
): string {
  return (
    '<!DOCTYPE html>' +
    renderToStaticMarkup(
      <AmpStateContext.Provider value={ampState}>
        {Document.renderDocument(Document, {
          __NEXT_DATA__: {
            dataManager: dataManagerData,
            props, // The result of getInitialProps
            page: pathname, // The rendered page
            query, // querystring parsed / passed by the user
            buildId, // buildId is used to facilitate caching of page bundles, we send it to the client so that pageloader knows where to load bundles
            assetPrefix: assetPrefix === '' ? undefined : assetPrefix, // send assetPrefix to the client side when configured, otherwise don't sent in the resulting HTML
            runtimeConfig, // runtimeConfig if provided, otherwise don't sent in the resulting HTML
            nextExport, // If this is a page exported by `next export`
            autoExport, // If this is an auto exported page
            dynamicIds:
              dynamicImportsIds.length === 0 ? undefined : dynamicImportsIds,
            err: err ? serializeError(dev, err) : undefined, // Error if one happened, otherwise don't sent in the resulting HTML
          },
          dangerousAsPath,
          canonicalBase,
          ampPath,
          inAmpMode,
          isDevelopment: !!dev,
          hasCssMode,
          hybridAmp,
          staticMarkup,
          devFiles,
          files,
          polyfillFiles,
          dynamicImports,
          assetPrefix,
          htmlProps,
          bodyTags,
          headTags,
          ...docProps,
        })}
      </AmpStateContext.Provider>
    )
  )
}

export async function renderToHTML(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  query: ParsedUrlQuery,
  renderOpts: RenderOpts
): Promise<string | null> {
  pathname = pathname === '/index' ? '/' : pathname
  const {
    err,
    dev = false,
    documentMiddlewareEnabled = false,
    ampBindInitData = false,
    staticMarkup = false,
    ampPath = '',
    App,
    Document,
    pageConfig = {},
    DocumentMiddleware,
    Component,
    buildManifest,
    reactLoadableManifest,
    ErrorDebug,
    unstable_getStaticProps,
    unstable_getStaticPaths,
  } = renderOpts

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
  const bodyTags = (...args: any) => callMiddleware('bodyTags', args)
  const htmlProps = (...args: any) => callMiddleware('htmlProps', args, true)

  const isSpr = !!unstable_getStaticProps
  const defaultAppGetInitialProps =
    App.getInitialProps === (App as any).origGetInitialProps

  const hasPageGetInitialProps = !!(Component as any).getInitialProps

  const isAutoExport =
    !hasPageGetInitialProps && defaultAppGetInitialProps && !isSpr

  if (hasPageGetInitialProps && isSpr) {
    throw new Error(SPR_GET_INITIAL_PROPS_CONFLICT + ` ${pathname}`)
  }

  if (!!unstable_getStaticPaths && !isSpr) {
    throw new Error(
      `unstable_getStaticPaths was added without a unstable_getStaticProps in ${pathname}. Without unstable_getStaticProps, unstable_getStaticPaths does nothing`
    )
  }

  if (dev) {
    const { isValidElementType } = require('react-is')
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

    if (isAutoExport) {
      // remove query values except ones that will be set during export
      query = {
        amp: query.amp,
      }
      req.url = pathname
      renderOpts.nextExport = true
    }
  }
  if (isAutoExport) renderOpts.autoExport = true
  if (isSpr) renderOpts.nextExport = false

  await Loadable.preloadAll() // Make sure all dynamic imports are loaded

  // @ts-ignore url will always be set
  const asPath: string = req.url
  const router = new ServerRouter(pathname, query, asPath)
  const ctx = {
    err,
    req: isAutoExport ? undefined : req,
    res: isAutoExport ? undefined : res,
    pathname,
    query,
    asPath,
    AppTree: (props: any) => {
      return (
        <AppContainer>
          <App {...props} Component={Component} router={router} />
        </AppContainer>
      )
    },
  }
  let props: any

  if (documentMiddlewareEnabled && typeof DocumentMiddleware === 'function') {
    await DocumentMiddleware(ctx)
  }

  let dataManager: DataManager | undefined
  if (ampBindInitData) {
    dataManager = new DataManager()
  }

  const ampState = {
    ampFirst: pageConfig.amp === true,
    hasQuery: Boolean(query.amp),
    hybrid: pageConfig.amp === 'hybrid',
  }

  const reactLoadableModules: string[] = []

  const AppContainer = ({ children }: any) => (
    <RouterContext.Provider value={router}>
      <DataManagerContext.Provider value={dataManager}>
        <AmpStateContext.Provider value={ampState}>
          <LoadableContext.Provider
            value={moduleName => reactLoadableModules.push(moduleName)}
          >
            {children}
          </LoadableContext.Provider>
        </AmpStateContext.Provider>
      </DataManagerContext.Provider>
    </RouterContext.Provider>
  )

  try {
    props = await loadGetInitialProps(App, {
      AppTree: ctx.AppTree,
      Component,
      router,
      ctx,
    })

    if (isSpr) {
      const data = await unstable_getStaticProps!({
        params: isDynamicRoute(pathname) ? query : undefined,
      })

      const invalidKeys = Object.keys(data).filter(
        key => key !== 'revalidate' && key !== 'props'
      )

      if (invalidKeys.length) {
        throw new Error(
          `Additional keys were returned from \`getStaticProps\`. Properties intended for your component must be nested under the \`props\` key, e.g.:` +
            `\n\n\treturn { props: { title: 'My Title', content: '...' } }` +
            `\n\nKeys that need moved: ${invalidKeys.join(', ')}.`
        )
      }

      if (typeof data.revalidate === 'number') {
        if (!Number.isInteger(data.revalidate)) {
          throw new Error(
            `A page's revalidate option must be seconds expressed as a natural number. Mixed numbers, such as '${data.revalidate}', cannot be used.` +
              `\nTry changing the value to '${Math.ceil(
                data.revalidate
              )}' or using \`Math.ceil()\` if you're computing the value.`
          )
        } else if (data.revalidate <= 0) {
          throw new Error(
            `A page's revalidate option can not be less than or equal to zero. A revalidate option of zero means to revalidate after _every_ request, and implies stale data cannot be tolerated.` +
              `\n\nTo never revalidate, you can set revalidate to \`false\` (only ran once at build-time).` +
              `\nTo revalidate as soon as possible, you can set the value to \`1\`.`
          )
        } else if (data.revalidate > 31536000) {
          // if it's greater than a year for some reason error
          console.warn(
            `Warning: A page's revalidate option was set to more than a year. This may have been done in error.` +
              `\nTo only run getStaticProps at build-time and not revalidate at runtime, you can set \`revalidate\` to \`false\`!`
          )
        }
      } else if (data.revalidate === true) {
        // When enabled, revalidate after 1 second. This value is optimal for
        // the most up-to-date page possible, but without a 1-to-1
        // request-refresh ratio.
        data.revalidate = 1
      } else {
        // By default, we never revalidate.
        data.revalidate = false
      }

      props.pageProps = data.props
      // pass up revalidate and props for export
      ;(renderOpts as any).revalidate = data.revalidate
      ;(renderOpts as any).sprData = props
    }
  } catch (err) {
    if (!dev || !err) throw err
    ctx.err = err
    renderOpts.err = err
  }

  // the response might be finished on the getInitialProps call
  if (isResSent(res) && !isSpr) return null

  const devFiles = buildManifest.devFiles
  const files = [
    ...new Set([
      ...getPageFiles(buildManifest, pathname),
      ...getPageFiles(buildManifest, '/_app'),
    ]),
  ]
  const polyfillFiles = getPageFiles(buildManifest, '/_polyfills')

  const renderElementToString = staticMarkup
    ? renderToStaticMarkup
    : renderToString

  const renderPageError = (): { html: string; head: any } | void => {
    if (ctx.err && ErrorDebug) {
      return render(
        renderElementToString,
        <ErrorDebug error={ctx.err} />,
        ampState
      )
    }

    if (dev && (props.router || props.Component)) {
      throw new Error(
        `'router' and 'Component' can not be returned in getInitialProps from _app.js https://err.sh/zeit/next.js/cant-override-next-props`
      )
    }
  }

  let renderPage: RenderPage

  if (ampBindInitData) {
    const ssrPrepass = require('react-ssr-prepass')

    renderPage = async (
      options: ComponentsEnhancer = {}
    ): Promise<{ html: string; head: any; dataOnly?: true }> => {
      const renderError = renderPageError()
      if (renderError) return renderError

      const {
        App: EnhancedApp,
        Component: EnhancedComponent,
      } = enhanceComponents(options, App, Component)

      const Application = () => (
        <AppContainer>
          <EnhancedApp
            Component={EnhancedComponent}
            router={router}
            {...props}
          />
        </AppContainer>
      )

      const element = <Application />

      try {
        return render(renderElementToString, element, ampState)
      } catch (err) {
        if (err && typeof err === 'object' && typeof err.then === 'function') {
          await ssrPrepass(element)
          if (renderOpts.dataOnly) {
            return {
              html: '',
              head: [],
              dataOnly: true,
            }
          } else {
            return render(renderElementToString, element, ampState)
          }
        }
        throw err
      }
    }
  } else {
    renderPage = (
      options: ComponentsEnhancer = {}
    ): { html: string; head: any } => {
      const renderError = renderPageError()
      if (renderError) return renderError

      const {
        App: EnhancedApp,
        Component: EnhancedComponent,
      } = enhanceComponents(options, App, Component)

      return render(
        renderElementToString,
        <AppContainer>
          <EnhancedApp
            Component={EnhancedComponent}
            router={router}
            {...props}
          />
        </AppContainer>,
        ampState
      )
    }
  }
  const documentCtx = { ...ctx, renderPage }
  const docProps = await loadGetInitialProps(Document, documentCtx)
  // the response might be finished on the getInitialProps call
  if (isResSent(res) && !isSpr) return null

  let dataManagerData = '[]'
  if (dataManager) {
    dataManagerData = JSON.stringify([...dataManager.getData()])
  }

  if (!docProps || typeof docProps.html !== 'string') {
    const message = `"${getDisplayName(
      Document
    )}.getInitialProps()" should resolve to an object with a "html" prop set with a valid html string`
    throw new Error(message)
  }

  if (docProps.dataOnly) {
    return dataManagerData
  }

  const dynamicImportIdsSet = new Set<string>()
  const dynamicImports: ManifestItem[] = []

  for (const mod of reactLoadableModules) {
    const manifestItem = reactLoadableManifest[mod]

    if (manifestItem) {
      manifestItem.forEach(item => {
        dynamicImports.push(item)
        dynamicImportIdsSet.add(item.id as string)
      })
    }
  }

  const dynamicImportsIds = [...dynamicImportIdsSet]
  const inAmpMode = isInAmpMode(ampState)
  const hybridAmp = ampState.hybrid

  // update renderOpts so export knows current state
  renderOpts.inAmpMode = inAmpMode
  renderOpts.hybridAmp = hybridAmp

  let html = renderDocument(Document, {
    ...renderOpts,
    dangerousAsPath: router.asPath,
    dataManagerData,
    ampState,
    props,
    headTags: await headTags(documentCtx),
    bodyTags: await bodyTags(documentCtx),
    htmlProps: await htmlProps(documentCtx),
    docProps,
    pathname,
    ampPath,
    query,
    inAmpMode,
    hybridAmp,
    dynamicImportsIds,
    dynamicImports,
    files,
    devFiles,
    polyfillFiles,
  })

  if (inAmpMode && html) {
    // inject HTML to AMP_RENDER_TARGET to allow rendering
    // directly to body in AMP mode
    const ampRenderIndex = html.indexOf(AMP_RENDER_TARGET)
    html =
      html.substring(0, ampRenderIndex) +
      `<!-- __NEXT_DATA__ -->${docProps.html}` +
      html.substring(ampRenderIndex + AMP_RENDER_TARGET.length)
    html = await optimizeAmp(html)

    if (renderOpts.ampValidator) {
      await renderOpts.ampValidator(html, pathname)
    }
  }

  if (inAmpMode || hybridAmp) {
    // fix &amp being escaped for amphtml rel link
    html = html.replace(/&amp;amp=1/g, '&amp=1')
  }

  return html
}

function errorToJSON(err: Error): Error {
  const { name, message, stack } = err
  return { name, message, stack }
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
