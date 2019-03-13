import { IncomingMessage, ServerResponse } from 'http'
import { ParsedUrlQuery } from 'querystring'
import React from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import Router from '../lib/router/router'
import { loadGetInitialProps, isResSent } from '../lib/utils'
import Head, { defaultHead } from '../lib/head'
import Loadable from '../lib/loadable'
import LoadableCapture from '../lib/loadable-capture'
import {
  getDynamicImportBundles,
  Manifest as ReactLoadableManifest,
  ManifestItem,
} from './get-dynamic-import-bundles'
import { getPageFiles, BuildManifest } from './get-page-files'
import { IsAmpContext } from '../lib/amphtml-context'

type Enhancer = (Component: React.ComponentType) => React.ComponentType
type ComponentsEnhancer =
  | { enhanceApp?: Enhancer; enhanceComponent?: Enhancer }
  | Enhancer

function noRouter() {
  const message = 'No router instance found. you should only use "next/router" inside the client side of your app. https://err.sh/zeit/next.js/no-router-instance'
  throw new Error(message)
}

class ServerRouter extends Router {
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
  staticMarkup: boolean
  buildId: string
  runtimeConfig?: { [key: string]: any }
  assetPrefix?: string
  err?: Error | null
  nextExport?: boolean
  dev?: boolean
  amphtml?: boolean
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
    ampEnabled = false,
    props,
    docProps,
    pathname,
    query,
    buildId,
    assetPrefix,
    runtimeConfig,
    nextExport,
    dynamicImportsIds,
    err,
    dev,
    amphtml,
    staticMarkup,
    devFiles,
    files,
    dynamicImports,
  }: RenderOpts & {
    props: any
    docProps: any
    pathname: string
    query: ParsedUrlQuery
    amphtml: boolean
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
            props, // The result of getInitialProps
            page: pathname, // The rendered page
            query, // querystring parsed / passed by the user
            buildId, // buildId is used to facilitate caching of page bundles, we send it to the client so that pageloader knows where to load bundles
            assetPrefix: assetPrefix === '' ? undefined : assetPrefix, // send assetPrefix to the client side when configured, otherwise don't sent in the resulting HTML
            runtimeConfig, // runtimeConfig if provided, otherwise don't sent in the resulting HTML
            nextExport, // If this is a page exported by `next export`
            dynamicIds:
              dynamicImportsIds.length === 0 ? undefined : dynamicImportsIds,
            err: err ? serializeError(dev, err) : undefined, // Error if one happened, otherwise don't sent in the resulting HTML
          }}
          ampEnabled={ampEnabled}
          amphtml={amphtml}
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
    staticMarkup = false,
    amphtml = false,
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

  const asPath = req.url
  const ctx = { err, req, res, pathname, query, asPath }
  const router = new ServerRouter(pathname, query, asPath)
  const props = await loadGetInitialProps(App, { Component, router, ctx })

  // the response might be finished on the getInitialProps call
  if (isResSent(res)) return null

  const devFiles = buildManifest.devFiles
  const files = [
    ...new Set([
      ...getPageFiles(buildManifest, pathname),
      ...getPageFiles(buildManifest, '/_app'),
    ]),
  ]

  const reactLoadableModules: string[] = []
  const renderPage = (
    options: ComponentsEnhancer = {},
  ): { html: string; head: any } => {
    const renderElementToString = staticMarkup
      ? renderToStaticMarkup
      : renderToString

    if (err && ErrorDebug) {
      return render(renderElementToString, <ErrorDebug error={err} />)
    }

    if (dev && (props.router || props.Component)) {
      throw new Error(
        `'router' and 'Component' can not be returned in getInitialProps from _app.js https://err.sh/zeit/next.js/cant-override-next-props.md`,
      )
    }

    const {
      App: EnhancedApp,
      Component: EnhancedComponent,
    } = enhanceComponents(options, App, Component)

    return render(
      renderElementToString,
      <IsAmpContext.Provider value={amphtml}>
        <LoadableCapture
          report={(moduleName) => reactLoadableModules.push(moduleName)}
        >
          <EnhancedApp
            Component={EnhancedComponent}
            router={router}
            {...props}
          />
        </LoadableCapture>
      </IsAmpContext.Provider>,
    )
  }

  const docProps = await loadGetInitialProps(Document, { ...ctx, renderPage })
  // the response might be finished on the getInitialProps call
  if (isResSent(res)) return null

  const dynamicImports = [
    ...getDynamicImportBundles(reactLoadableManifest, reactLoadableModules),
  ]
  const dynamicImportsIds: any = dynamicImports.map((bundle) => bundle.id)

  return renderDocument(Document, {
    ...renderOpts,
    props,
    docProps,
    pathname,
    amphtml,
    query,
    dynamicImportsIds,
    dynamicImports,
    files,
    devFiles,
  })
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
