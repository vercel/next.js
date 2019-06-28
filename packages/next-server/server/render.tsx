import { IncomingMessage, ServerResponse } from 'http'
import { ParsedUrlQuery } from 'querystring'
import React from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import { BaseRouter } from '../lib/router/router'
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
import { RequestContext } from '../lib/request-context'
import { LoadableContext } from '../lib/loadable-context'
import { RouterContext } from '../lib/router-context'
import { DataManager } from '../lib/data-manager'
import {
  ManifestItem,
  getDynamicImportBundles,
  Manifest as ReactLoadableManifest,
} from './get-dynamic-import-bundles'
import { getPageFiles, BuildManifest } from './get-page-files'
import { AmpStateContext } from '../lib/amp-context'
import optimizeAmp from './optimize-amp'
import { isInAmpMode } from '../lib/amp'
import { IPageConfig } from './load-components'

function noRouter() {
  const message =
    'No router instance found. you should only use "next/router" inside the client side of your app. https://err.sh/zeit/next.js/no-router-instance'
  throw new Error(message)
}

class ServerRouter implements BaseRouter {
  route: string
  pathname: string
  query: ParsedUrlQuery
  asPath: string
  // TODO: Remove in the next major version, as this would mean the user is adding event listeners in server-side `render` method
  static events: MittEmitter = mitt()

  constructor(pathname: string, query: ParsedUrlQuery, as: string) {
    this.route = pathname.replace(/\/$/, '') || '/'
    this.pathname = pathname
    this.query = query
    this.asPath = as
    this.pathname = pathname
  }
  // @ts-ignore
  push() {
    noRouter()
  }
  // @ts-ignore
  replace() {
    noRouter()
  }
  // @ts-ignore
  reload() {
    noRouter()
  }
  back() {
    noRouter()
  }
  // @ts-ignore
  prefetch() {
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
    head = Head.rewind() || defaultHead(undefined, isInAmpMode(ampMode))
  }

  return { html, head }
}

type RenderOpts = {
  documentMiddlewareEnabled: boolean
  ampBindInitData: boolean
  staticMarkup: boolean
  buildId: string
  canonicalBase: string
  dynamicBuildId?: boolean
  runtimeConfig?: { [key: string]: any }
  dangerousAsPath: string
  assetPrefix?: string
  err?: Error | null
  nextExport?: boolean
  dev?: boolean
  ampMode?: any
  ampPath?: string
  dataOnly?: boolean
  inAmpMode?: boolean
  hybridAmp?: boolean
  buildManifest: BuildManifest
  reactLoadableManifest: ReactLoadableManifest
  PageConfig: IPageConfig
  Component: React.ComponentType
  Document: DocumentType
  DocumentMiddleware: (ctx: NextPageContext) => void
  App: AppType
  ErrorDebug?: React.ComponentType<{ error: Error }>
  ampValidator?: (html: string, pathname: string) => Promise<void>
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
    dynamicBuildId = false,
    assetPrefix,
    runtimeConfig,
    nextExport,
    dynamicImportsIds,
    dangerousAsPath,
    err,
    dev,
    ampPath,
    ampState,
    inAmpMode,
    hybridAmp,
    staticMarkup,
    devFiles,
    files,
    dynamicImports,
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
  }
): string {
  return (
    '<!DOCTYPE html>' +
    renderToStaticMarkup(
      <AmpStateContext.Provider value={ampState}>
        <Document
          __NEXT_DATA__={{
            dataManager: dataManagerData,
            props, // The result of getInitialProps
            page: pathname, // The rendered page
            query, // querystring parsed / passed by the user
            buildId, // buildId is used to facilitate caching of page bundles, we send it to the client so that pageloader knows where to load bundles
            dynamicBuildId, // Specifies if the buildId should by dynamically fetched
            assetPrefix: assetPrefix === '' ? undefined : assetPrefix, // send assetPrefix to the client side when configured, otherwise don't sent in the resulting HTML
            runtimeConfig, // runtimeConfig if provided, otherwise don't sent in the resulting HTML
            nextExport, // If this is a page exported by `next export`
            dynamicIds:
              dynamicImportsIds.length === 0 ? undefined : dynamicImportsIds,
            err: err ? serializeError(dev, err) : undefined, // Error if one happened, otherwise don't sent in the resulting HTML
          }}
          dangerousAsPath={dangerousAsPath}
          canonicalBase={canonicalBase}
          ampPath={ampPath}
          inAmpMode={inAmpMode}
          hybridAmp={hybridAmp}
          staticMarkup={staticMarkup}
          devFiles={devFiles}
          files={files}
          dynamicImports={dynamicImports}
          assetPrefix={assetPrefix}
          {...docProps}
        />
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
    PageConfig,
    DocumentMiddleware,
    Component,
    buildManifest,
    reactLoadableManifest,
    ErrorDebug,
  } = renderOpts

  await Loadable.preloadAll() // Make sure all dynamic imports are loaded
  let isStaticPage = false

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

    isStaticPage = typeof (Component as any).getInitialProps !== 'function'
    const defaultAppGetInitialProps =
      App.getInitialProps === (App as any).origGetInitialProps
    isStaticPage = isStaticPage && defaultAppGetInitialProps

    if (isStaticPage) {
      // remove query values except ones that will be set during export
      query = {
        amp: query.amp,
      }
      renderOpts.nextExport = true
    }
  }

  // @ts-ignore url will always be set
  const asPath: string = req.url
  const ctx = {
    err,
    req: isStaticPage ? undefined : req,
    res: isStaticPage ? undefined : res,
    pathname,
    query,
    asPath,
  }
  const router = new ServerRouter(pathname, query, asPath)
  let props: any

  if (documentMiddlewareEnabled && typeof DocumentMiddleware === 'function') {
    await DocumentMiddleware(ctx)
  }

  try {
    props = await loadGetInitialProps(App, { Component, router, ctx })
  } catch (err) {
    if (!dev || !err) throw err
    ctx.err = err
    renderOpts.err = err
  }

  // the response might be finished on the getInitialProps call
  if (isResSent(res)) return null

  const devFiles = buildManifest.devFiles
  const files = [
    ...new Set([
      ...getPageFiles(buildManifest, pathname),
      ...getPageFiles(buildManifest, '/_app'),
    ]),
  ]
  let dataManager: DataManager | undefined
  if (ampBindInitData) {
    dataManager = new DataManager()
  }

  const ampState = {
    ampFirst: PageConfig.amp === true,
    hasQuery: Boolean(query.amp),
    hybrid: PageConfig.amp === 'hybrid',
  }

  const reactLoadableModules: string[] = []
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
        <RequestContext.Provider value={req}>
          <RouterContext.Provider value={router}>
            <DataManagerContext.Provider value={dataManager}>
              <AmpStateContext.Provider value={ampState}>
                <LoadableContext.Provider
                  value={moduleName => reactLoadableModules.push(moduleName)}
                >
                  <EnhancedApp
                    Component={EnhancedComponent}
                    router={router}
                    {...props}
                  />
                </LoadableContext.Provider>
              </AmpStateContext.Provider>
            </DataManagerContext.Provider>
          </RouterContext.Provider>
        </RequestContext.Provider>
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
        <RequestContext.Provider value={req}>
          <RouterContext.Provider value={router}>
            <AmpStateContext.Provider value={ampState}>
              <LoadableContext.Provider
                value={moduleName => reactLoadableModules.push(moduleName)}
              >
                <EnhancedApp
                  Component={EnhancedComponent}
                  router={router}
                  {...props}
                />
              </LoadableContext.Provider>
            </AmpStateContext.Provider>
          </RouterContext.Provider>
        </RequestContext.Provider>,
        ampState
      )
    }
  }

  const docProps = await loadGetInitialProps(Document, { ...ctx, renderPage })
  // the response might be finished on the getInitialProps call
  if (isResSent(res)) return null

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

  const dynamicImports = [
    ...getDynamicImportBundles(reactLoadableManifest, reactLoadableModules),
  ]
  const dynamicImportsIds: any = [
    ...new Set(dynamicImports.map(bundle => bundle.id)),
  ]
  const inAmpMode = isInAmpMode(ampState)
  const hybridAmp = ampState.hybrid

  // update renderOpts so export knows it's AMP state
  renderOpts.inAmpMode = inAmpMode
  renderOpts.hybridAmp = hybridAmp

  let html = renderDocument(Document, {
    ...renderOpts,
    dangerousAsPath: router.asPath,
    dataManagerData,
    ampState,
    props,
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
  })

  if (inAmpMode && html) {
    // use replace to allow rendering directly to body in AMP mode
    html = html.replace(
      '__NEXT_AMP_RENDER_TARGET__',
      `<!-- __NEXT_DATA__ -->${docProps.html}`
    )
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
