import {IncomingMessage, ServerResponse} from 'http'
import { ParsedUrlQuery } from 'querystring'
import { join } from 'path'
import React from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import {requirePage} from './require'
import Router from '../lib/router/router'
import { loadGetInitialProps, isResSent } from '../lib/utils'
import Head, { defaultHead } from '../lib/head'
import Loadable from '../lib/loadable'
import LoadableCapture from '../lib/loadable-capture'
import { BUILD_MANIFEST, REACT_LOADABLE_MANIFEST, SERVER_DIRECTORY, CLIENT_STATIC_FILES_PATH } from 'next-server/constants'
import {getDynamicImportBundles, ManifestItem} from './get-dynamic-import-bundles'
import {getPageFiles} from './get-page-files'

type Enhancer = (Component: React.ComponentType) => React.ComponentType
type ComponentsEnhancer = {enhanceApp?: Enhancer, enhanceComponent?: Enhancer}|Enhancer

function enhanceComponents(options: ComponentsEnhancer, App: React.ComponentType, Component: React.ComponentType): {
  App: React.ComponentType,
  Component: React.ComponentType
} {
  // For backwards compatibility
  if(typeof options === 'function') {
    return {
      App: App,
      Component: options(Component)
    }
  }

  return {
    App: options.enhanceApp ? options.enhanceApp(App) : App,
    Component: options.enhanceComponent ? options.enhanceComponent(Component) : Component
  }
}

function interoptDefault(mod: any) {
  return mod.default || mod
}

function render(renderElementToString: (element: React.ReactElement<any>) => string, element: React.ReactElement<any>): {html: string, head: any} {
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
  staticMarkup: boolean,
  distDir: string,
  buildId: string,
  runtimeConfig?: {[key: string]: any},
  assetPrefix?: string,
  err?: Error|null,
  nextExport?: boolean,
  dev?: boolean
}

function renderDocument(Document: React.ComponentType, {
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
  staticMarkup,
  devFiles,
  files,
  dynamicImports,
}: RenderOpts & {
  props: any,
  docProps: any,
  pathname: string,
  query: ParsedUrlQuery,
  dynamicImportsIds: string[],
  dynamicImports: ManifestItem[],
  files: string[]
  devFiles: string[],
}): string {
  return '<!DOCTYPE html>' + renderToStaticMarkup(
    <Document
      __NEXT_DATA__={{
        props, // The result of getInitialProps
        page: pathname, // The rendered page
        query, // querystring parsed / passed by the user
        buildId, // buildId is used to facilitate caching of page bundles, we send it to the client so that pageloader knows where to load bundles
        assetPrefix: assetPrefix === '' ? undefined : assetPrefix, // send assetPrefix to the client side when configured, otherwise don't sent in the resulting HTML
        runtimeConfig, // runtimeConfig if provided, otherwise don't sent in the resulting HTML
        nextExport, // If this is a page exported by `next export`
        dynamicIds: dynamicImportsIds.length === 0 ? undefined : dynamicImportsIds,
        err: (err) ? serializeError(dev, err) : undefined // Error if one happened, otherwise don't sent in the resulting HTML
      }}
      staticMarkup={staticMarkup}
      devFiles={devFiles}
      files={files}
      dynamicImports={dynamicImports}
      assetPrefix={assetPrefix}
      {...docProps}
    />
  )
}

export async function renderToHTML (req: IncomingMessage, res: ServerResponse, pathname: string, query: ParsedUrlQuery, renderOpts: RenderOpts): Promise<string|null> {
  const {
    err,
    buildId,
    distDir,
    dev = false,
    staticMarkup = false
  } = renderOpts
  const documentPath = join(distDir, SERVER_DIRECTORY, CLIENT_STATIC_FILES_PATH, buildId, 'pages', '_document')
  const appPath = join(distDir, SERVER_DIRECTORY, CLIENT_STATIC_FILES_PATH, buildId, 'pages', '_app')
  let [buildManifest, reactLoadableManifest, Component, Document, App] = await Promise.all([
    require(join(distDir, BUILD_MANIFEST)),
    require(join(distDir, REACT_LOADABLE_MANIFEST)),
    interoptDefault(requirePage(pathname, distDir)),
    interoptDefault(require(documentPath)),
    interoptDefault(require(appPath))
  ])

  await Loadable.preloadAll() // Make sure all dynamic imports are loaded

  if (dev) {
    const { isValidElementType } = require('react-is')
    if (!isValidElementType(Component)) {
      throw new Error(`The default export is not a React Component in page: "${pathname}"`)
    }

    if (!isValidElementType(App)) {
      throw new Error(`The default export is not a React Component in page: "/_app"`)
    }

    if (!isValidElementType(Document)) {
      throw new Error(`The default export is not a React Component in page: "/_document"`)
    }
  }

  const asPath = req.url
  const ctx = { err, req, res, pathname, query, asPath }
  const router = new Router(pathname, query, asPath)
  const props = await loadGetInitialProps(App, {Component, router, ctx})

  // the response might be finished on the getInitialProps call
  if (isResSent(res)) return null

  const devFiles = buildManifest.devFiles
  const files = [
    ...new Set([
      ...getPageFiles(buildManifest, pathname),
      ...getPageFiles(buildManifest, '/_app'),
      ...getPageFiles(buildManifest, '/_error')
    ])
  ]

  const reactLoadableModules: string[] = []
  const renderPage = (options: ComponentsEnhancer = {}): {html: string, head: any} => {
    const {App: EnhancedApp, Component: EnhancedComponent} = enhanceComponents(options, App, Component)
    const renderElementToString = staticMarkup ? renderToStaticMarkup : renderToString

    if(err && dev) {
      const ErrorDebug = require(join(distDir, SERVER_DIRECTORY, 'error-debug')).default
      return render(renderElementToString, <ErrorDebug error={err} />)
    }

    return render(renderElementToString,
      <LoadableCapture report={(moduleName) => reactLoadableModules.push(moduleName)}>
        <EnhancedApp
          Component={EnhancedComponent}
          router={router}
          {...props}
        />
      </LoadableCapture>
    )
  }

  const docProps = await loadGetInitialProps(Document, { ...ctx, renderPage })
  // the response might be finshed on the getInitialProps call
  if (isResSent(res)) return null

  const dynamicImports = [...getDynamicImportBundles(reactLoadableManifest, reactLoadableModules)]
  const dynamicImportsIds: any = dynamicImports.map((bundle) => bundle.id)

  return renderDocument(Document, {
    ...renderOpts,
    props,
    docProps,
    pathname,
    query,
    dynamicImportsIds,
    dynamicImports,
    files,
    devFiles
  })
}

function errorToJSON (err: Error): Error {
  const { name, message, stack } = err
  return { name, message, stack }
}

function serializeError (dev: boolean|undefined, err: Error): Error & {statusCode?: number} {
  if (dev) {
    return errorToJSON(err)
  }

  return { name: 'Internal Server Error.', message: '500 - Internal Server Error.', statusCode: 500 }
}
