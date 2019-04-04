import { IncomingMessage, ServerResponse } from 'http'
import { ParsedUrlQuery } from 'querystring'
import React from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import {IRouterInterface} from '../lib/router/router'
import mitt, {MittEmitter} from '../lib/mitt';
import { loadGetInitialProps, isResSent } from '../lib/utils'
import Head, { defaultHead } from '../lib/head'
import Loadable from '../lib/loadable'
import { DataManagerContext } from '../lib/data-manager-context'
import {LoadableContext} from '../lib/loadable-context'
import { RouterContext } from '../lib/router-context'
import { DataManager } from '..//lib/data-manager'

import {
  getDynamicImportBundles,
  Manifest as ReactLoadableManifest,
  ManifestItem,
} from './get-dynamic-import-bundles'
import { getPageFiles, BuildManifest } from './get-page-files'
import { IsAmpContext } from '../lib/amphtml-context'
import optimizeAmp from './optimize-amp'

type Enhancer = (Component: React.ComponentType) => React.ComponentType
type ComponentsEnhancer =
  | { enhanceApp?: Enhancer; enhanceComponent?: Enhancer }
  | Enhancer

function noRouter() {
  const message = 'No router instance found. you should only use "next/router" inside the client side of your app. https://err.sh/zeit/next.js/no-router-instance'
  throw new Error(message)
}

class ServerRouter implements IRouterInterface {
  route: string
  pathname: string
  query: string
  asPath: string
  // TODO: Remove in the next major version, as this would mean the user is adding event listeners in server-side `render` method
  static events: MittEmitter = mitt()

  constructor(pathname: string, query: any, as: string) {
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
  App: React.ComponentType,
  Component: React.ComponentType,
): {
  App: React.ComponentType
  Component: React.ComponentType,
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
): { html: string; head: any } {
  let html
  let head

  try {
    html = renderElementToString(element)
  } finally {
    head = Head.rewind() || defaultHead()
  }

  return { html, head }
}

type RenderOpts = {
  ampEnabled: boolean
  noDirtyAmp: boolean
  ampBindInitData: boolean
  staticMarkup: boolean
  buildId: string
  dynamicBuildId?: boolean
  runtimeConfig?: { [key: string]: any }
  assetPrefix?: string
  err?: Error | null
  nextExport?: boolean
  dev?: boolean
  ampPath?: string
  amphtml?: boolean
  hasAmp?: boolean,
  dataOnly?: boolean,
  buildManifest: BuildManifest
  reactLoadableManifest: ReactLoadableManifest
  Component: React.ComponentType
  Document: React.ComponentType
  App: React.ComponentType
  ErrorDebug?: React.ComponentType<{ error: Error }>,
}

function renderDocument(
  Document: React.ComponentType,
  {
    dataManagerData,
    ampEnabled = false,
    props,
    docProps,
    pathname,
    query,
    buildId,
    dynamicBuildId = false,
    assetPrefix,
    runtimeConfig,
    nextExport,
    dynamicImportsIds,
    err,
    dev,
    ampPath,
    amphtml,
    hasAmp,
    staticMarkup,
    devFiles,
    files,
    dynamicImports,
  }: RenderOpts & {
    dataManagerData: any,
    props: any
    docProps: any
    pathname: string
    query: ParsedUrlQuery
    ampPath: string,
    amphtml: boolean
    hasAmp: boolean,
    dynamicImportsIds: string[]
    dynamicImports: ManifestItem[]
    files: string[]
    devFiles: string[],
  },
): string {
  return (
    '<!DOCTYPE html>' +
    renderToStaticMarkup(
      <IsAmpContext.Provider value={amphtml}>
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
          ampEnabled={ampEnabled}
          ampPath={ampPath}
          amphtml={amphtml}
          hasAmp={hasAmp}
          staticMarkup={staticMarkup}
          devFiles={devFiles}
          files={files}
          dynamicImports={dynamicImports}
          assetPrefix={assetPrefix}
          {...docProps}
        />
      </IsAmpContext.Provider>,
    )
  )
}

export async function renderToHTML(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  query: ParsedUrlQuery,
  renderOpts: RenderOpts,
): Promise<string | null> {
  pathname = pathname === '/index' ? '/' : pathname
  const {
    err,
    dev = false,
    ampBindInitData = false,
    staticMarkup = false,
    noDirtyAmp = false,
    amphtml = false,
    hasAmp = false,
    ampPath = '',
    App,
    Document,
    Component,
    buildManifest,
    reactLoadableManifest,
    ErrorDebug,
  } = renderOpts

  await Loadable.preloadAll() // Make sure all dynamic imports are loaded

  if (dev) {
    const { isValidElementType } = require('react-is')
    if (!isValidElementType(Component)) {
      throw new Error(
        `The default export is not a React Component in page: "${pathname}"`,
      )
    }

    if (!isValidElementType(App)) {
      throw new Error(
        `The default export is not a React Component in page: "/_app"`,
      )
    }

    if (!isValidElementType(Document)) {
      throw new Error(
        `The default export is not a React Component in page: "/_document"`,
      )
    }
  }

  // @ts-ignore url will always be set
  const asPath: string = req.url
  const ctx = { err, req, res, pathname, query, asPath }
  const router = new ServerRouter(pathname, query, asPath)
  let props: any

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

  const reactLoadableModules: string[] = []
  const renderElementToString = staticMarkup
    ? renderToStaticMarkup
    : renderToString

  const renderPageError = (): {html: string, head: any} | void => {
    if (ctx.err && ErrorDebug) {
      return render(renderElementToString, <ErrorDebug error={ctx.err} />)
    }

    if (dev && (props.router || props.Component)) {
      throw new Error(
        `'router' and 'Component' can not be returned in getInitialProps from _app.js https://err.sh/zeit/next.js/cant-override-next-props.md`,
      )
    }
  }

  let renderPage: (options: ComponentsEnhancer) => { html: string, head: any } | Promise<{ html: string; head: any }>

  if (ampBindInitData) {
    renderPage = async (
      options: ComponentsEnhancer = {},
    ): Promise<{ html: string; head: any }> => {
      const renderError = renderPageError()
      if (renderError) return renderError

      const {
        App: EnhancedApp,
        Component: EnhancedComponent,
      } = enhanceComponents(options, App, Component)

      let recursionCount = 0

      const renderTree = async (): Promise<any> => {
        recursionCount++
        // This is temporary, we can remove it once the API is finished.
        if (recursionCount > 100) {
          throw new Error('Did 100 promise recursions, bailing out to avoid infinite loop.')
        }
        try {
          return await render(
            renderElementToString,
            <RouterContext.Provider value={router}>
              <DataManagerContext.Provider value={dataManager}>
                <IsAmpContext.Provider value={amphtml}>
                  <LoadableContext.Provider
                    value={(moduleName) => reactLoadableModules.push(moduleName)}
                  >
                    <EnhancedApp
                      Component={EnhancedComponent}
                      router={router}
                      {...props}
                    />
                  </LoadableContext.Provider>
                </IsAmpContext.Provider>
              </DataManagerContext.Provider>
            </RouterContext.Provider>,

          )
        } catch (err) {
          if (typeof err.then !== 'undefined') {
            await err
            return await renderTree()
          }
          throw err
        }
      }
      const res = await renderTree()
      return res
    }
  } else {
    renderPage = (
      options: ComponentsEnhancer = {},
    ): { html: string; head: any } => {
      const renderError = renderPageError()
      if (renderError) return renderError

      const {
        App: EnhancedApp,
        Component: EnhancedComponent,
      } = enhanceComponents(options, App, Component)

      return render(
        renderElementToString,
        <RouterContext.Provider value={router}>
          <IsAmpContext.Provider value={amphtml}>
            <LoadableContext.Provider
              value={(moduleName) => reactLoadableModules.push(moduleName)}
            >
              <EnhancedApp
                Component={EnhancedComponent}
                router={router}
                {...props}
              />
            </LoadableContext.Provider>
          </IsAmpContext.Provider>
        </RouterContext.Provider>,
      )
    }
  }

  const docProps = await loadGetInitialProps(Document, { ...ctx, renderPage })
  // the response might be finished on the getInitialProps call
  if (isResSent(res)) return null

  const dynamicImports = [
    ...getDynamicImportBundles(reactLoadableManifest, reactLoadableModules),
  ]
  const dynamicImportsIds: any = dynamicImports.map((bundle) => bundle.id)

  let dataManagerData = '[]'
  if (dataManager) {
    dataManagerData = JSON.stringify([...dataManager.getData()])
  }

  if (renderOpts.dataOnly) {
    return dataManagerData
  }

  let html = renderDocument(Document, {
    ...renderOpts,
    dataManagerData,
    props,
    docProps,
    pathname,
    ampPath,
    amphtml,
    hasAmp,
    query,
    dynamicImportsIds,
    dynamicImports,
    files,
    devFiles,
  })

  if (!dev && amphtml && html) {
    html = await optimizeAmp(html, { amphtml, noDirtyAmp, query })
  }
  return html
}

function errorToJSON(err: Error): Error {
  const { name, message, stack } = err
  return { name, message, stack }
}

function serializeError(
  dev: boolean | undefined,
  err: Error,
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
