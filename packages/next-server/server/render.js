import { join } from 'path'
import React from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import generateETag from 'etag'
import fresh from 'fresh'
import requirePage, {normalizePagePath} from './require'
import Router from '../lib/router/router'
import { loadGetInitialProps, isResSent } from '../lib/utils'
import Head, { defaultHead } from '../lib/head'
import Loadable from '../lib/loadable'
import LoadableCapture from '../lib/loadable-capture'
import { BUILD_MANIFEST, REACT_LOADABLE_MANIFEST, SERVER_DIRECTORY, CLIENT_STATIC_FILES_PATH } from 'next-server/constants'
import {getDynamicImportBundles} from './get-dynamic-import-bundles'

export function renderToHTML (req, res, pathname, query, opts) {
  return doRender(req, res, pathname, query, opts)
}

// _pathname is for backwards compatibility
export function renderErrorToHTML (err, req, res, _pathname, query, opts = {}) {
  return doRender(req, res, '/_error', query, { ...opts, err })
}

function getPageFiles (buildManifest, page) {
  const normalizedPage = normalizePagePath(page)
  const files = buildManifest.pages[normalizedPage]

  if (!files) {
    console.warn(`Could not find files for ${normalizedPage} in .next/build-manifest.json`)
    return []
  }

  return files
}

async function doRender (req, res, pathname, query, {
  err,
  buildId,
  assetPrefix,
  runtimeConfig,
  distDir,
  dev = false,
  staticMarkup = false,
  nextExport
} = {}) {
  const documentPath = join(distDir, SERVER_DIRECTORY, CLIENT_STATIC_FILES_PATH, buildId, 'pages', '_document')
  const appPath = join(distDir, SERVER_DIRECTORY, CLIENT_STATIC_FILES_PATH, buildId, 'pages', '_app')
  let [buildManifest, reactLoadableManifest, Component, Document, App] = await Promise.all([
    require(join(distDir, BUILD_MANIFEST)),
    require(join(distDir, REACT_LOADABLE_MANIFEST)),
    requirePage(pathname, {distDir}),
    require(documentPath),
    require(appPath)
  ])

  await Loadable.preloadAll() // Make sure all dynamic imports are loaded

  Component = Component.default || Component

  if (typeof Component !== 'function') {
    throw new Error(`The default export is not a React Component in page: "${pathname}"`)
  }

  App = App.default || App
  Document = Document.default || Document
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
  if (isResSent(res)) return

  let reactLoadableModules = []
  const renderPage = (options = Page => Page) => {
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

    const app = <LoadableCapture report={moduleName => reactLoadableModules.push(moduleName)}>
      <EnhancedApp {...{
        Component: EnhancedComponent,
        router,
        ...props
      }} />
    </LoadableCapture>

    const render = staticMarkup ? renderToStaticMarkup : renderToString

    let html
    let head

    try {
      if (err && dev) {
        const ErrorDebug = require(join(distDir, SERVER_DIRECTORY, 'error-debug')).default
        html = render(<ErrorDebug error={err} />)
      } else {
        html = render(app)
      }
    } finally {
      head = Head.rewind() || defaultHead()
    }

    return { html, head, buildManifest }
  }

  const docProps = await loadGetInitialProps(Document, { ...ctx, renderPage })
  const dynamicImports = [...getDynamicImportBundles(reactLoadableManifest, reactLoadableModules)]
  const dynamicImportsIds = dynamicImports.map((bundle) => bundle.id)

  if (isResSent(res)) return

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

export function sendHTML (req, res, html, method, { dev, generateEtags }) {
  if (isResSent(res)) return
  const etag = generateEtags && generateETag(html)

  if (fresh(req.headers, { etag })) {
    res.statusCode = 304
    res.end()
    return
  }

  if (dev) {
    // In dev, we should not cache pages for any reason.
    res.setHeader('Cache-Control', 'no-store, must-revalidate')
  }

  if (etag) {
    res.setHeader('ETag', etag)
  }

  if (!res.getHeader('Content-Type')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
  }
  res.setHeader('Content-Length', Buffer.byteLength(html))
  res.end(method === 'HEAD' ? null : html)
}

function errorToJSON (err) {
  const { name, message, stack } = err
  const json = { name, message, stack }

  if (err.module) {
    // rawRequest contains the filename of the module which has the error.
    const { rawRequest } = err.module
    json.module = { rawRequest }
  }

  return json
}

function serializeError (dev, err) {
  if (dev) {
    return errorToJSON(err)
  }

  return { message: '500 - Internal Server Error.' }
}
