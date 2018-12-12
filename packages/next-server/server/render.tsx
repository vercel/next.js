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
import {getDynamicImportBundles} from './get-dynamic-import-bundles'
import {getPageFiles} from './get-page-files'

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

function interoptDefault(mod: any) {
  return mod.default || mod
}

export async function renderToHTML (req: IncomingMessage, res: ServerResponse, pathname: string, query: ParsedUrlQuery, {
  err,
  buildId,
  assetPrefix,
  runtimeConfig,
  distDir,
  dev = false,
  staticMarkup = false,
  nextExport
}: RenderOpts): Promise<string|null> {
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

  if (typeof Component !== 'function') {
    throw new Error(`The default export is not a React Component in page: "${pathname}"`)
  }

  const asPath = req.url
  const ctx = { err, req, res, pathname, query, asPath }
  const router = new Router(pathname, query, asPath)
  const props = await loadGetInitialProps(App, {Component, router, ctx})
  const devFiles = buildManifest.devFiles
  const files = [
    ...new Set([
      ...getPageFiles(buildManifest, pathname),
      ...getPageFiles(buildManifest, '/_app'),
      ...getPageFiles(buildManifest, '/_error')
    ])
  ]

  // the response might be finshed on the getinitialprops call
  if (isResSent(res)) return null

  let reactLoadableModules: string[] = []
  const renderPage = (options: any = (Page: React.ComponentType) => Page) => {
    let EnhancedApp = App
    let EnhancedComponent = Component

    // For backwards compatibility
    if (typeof options === 'function') {
      EnhancedComponent = options(Component)
    } else if (typeof options === 'object') {
      if (options.enhanceApp) {
        EnhancedApp = options.enhanceApp(App)
      }
      if (options.enhanceComponent) {
        EnhancedComponent = options.enhanceComponent(Component)
      }
    }

    const render = staticMarkup ? renderToStaticMarkup : renderToString

    let html
    let head

    try {
      if (err && dev) {
        const ErrorDebug = require(join(distDir, SERVER_DIRECTORY, 'error-debug')).default
        html = render(<ErrorDebug error={err} />)
      } else {
        html = render(
          <LoadableCapture report={(moduleName: string) => reactLoadableModules.push(moduleName)}>
            <EnhancedApp
              Component={EnhancedComponent}
              router={router}
              {...props}
            />
          </LoadableCapture>
        )
      }
    } finally {
      head = Head.rewind() || defaultHead()
    }

    return { html, head, buildManifest }
  }

  const docProps = await loadGetInitialProps(Document, { ...ctx, renderPage })
  const dynamicImports = [...getDynamicImportBundles(reactLoadableManifest, reactLoadableModules)]
  const dynamicImportsIds = dynamicImports.map((bundle) => bundle.id)

  if (isResSent(res)) return null

  if (!Document.prototype || !Document.prototype.isReactComponent) throw new Error('_document.js is not exporting a React component')
  const doc = <Document {...{
    __NEXT_DATA__: {
      props, // The result of getInitialProps
      page: pathname, // The rendered page
      query, // querystring parsed / passed by the user
      buildId, // buildId is used to facilitate caching of page bundles, we send it to the client so that pageloader knows where to load bundles
      assetPrefix: assetPrefix === '' ? undefined : assetPrefix, // send assetPrefix to the client side when configured, otherwise don't sent in the resulting HTML
      runtimeConfig, // runtimeConfig if provided, otherwise don't sent in the resulting HTML
      nextExport, // If this is a page exported by `next export`
      dynamicIds: dynamicImportsIds.length === 0 ? undefined : dynamicImportsIds,
      err: (err) ? serializeError(dev, err) : undefined // Error if one happened, otherwise don't sent in the resulting HTML
    },
    staticMarkup,
    devFiles,
    files,
    dynamicImports,
    assetPrefix, // We always pass assetPrefix as a top level property since _document needs it to render, even though the client side might not need it
    ...docProps
  }} />

  return '<!DOCTYPE html>' + renderToStaticMarkup(doc)
}

type SerializedError = {
  message: string,
  name?: string
  stack?: string
}

function errorToJSON (err: Error): SerializedError {
  const { name, message, stack } = err
  return { name, message, stack }
}

function serializeError (dev: boolean, err: Error): SerializedError {
  if (dev) {
    return errorToJSON(err)
  }

  return { message: '500 - Internal Server Error.' }
}
