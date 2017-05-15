import { join } from 'path'
import { createElement } from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import send from 'send'
import generateETag from 'etag'
import fresh from 'fresh'
import requireModule from './require'
import getConfig from './config'
import resolvePath from './resolve'
import { Router } from '../lib/router'
import { loadGetInitialProps } from '../lib/utils'
import Head, { defaultHead } from '../lib/head'
import App from '../lib/app'
import ErrorDebug from '../lib/error-debug'
import { flushChunks } from '../lib/dynamic'

export async function render (req, res, pathname, query, opts) {
  const html = await renderToHTML(req, res, pathname, opts)
  sendHTML(req, res, html, req.method)
}

export function renderToHTML (req, res, pathname, query, opts) {
  return doRender(req, res, pathname, query, opts)
}

export async function renderError (err, req, res, pathname, query, opts) {
  const html = await renderErrorToHTML(err, req, res, query, opts)
  sendHTML(req, res, html, req.method)
}

export function renderErrorToHTML (err, req, res, pathname, query, opts = {}) {
  return doRender(req, res, pathname, query, { ...opts, err, page: '_error' })
}

async function doRender (req, res, pathname, query, {
  err,
  page,
  buildId,
  buildStats,
  hotReloader,
  assetPrefix,
  dir = process.cwd(),
  dev = false,
  staticMarkup = false,
  nextExport = false
} = {}) {
  page = page || pathname

  await ensurePage(page, { dir, hotReloader })

  const dist = getConfig(dir).distDir

  let [Component, Document] = await Promise.all([
    requireModule(join(dir, dist, 'dist', 'pages', page)),
    requireModule(join(dir, dist, 'dist', 'pages', '_document'))
  ])
  Component = Component.default || Component
  Document = Document.default || Document
  const asPath = req.url
  const ctx = { err, req, res, pathname, query, asPath }
  const props = await loadGetInitialProps(Component, ctx)

  // the response might be finshed on the getinitialprops call
  if (res.finished) return

  const renderPage = () => {
    const app = createElement(App, {
      Component,
      props,
      router: new Router(pathname, query)
    })

    const render = staticMarkup ? renderToStaticMarkup : renderToString

    let html
    let head
    let errorHtml = ''
    try {
      html = render(app)
    } finally {
      head = Head.rewind() || defaultHead()
    }
    const chunks = flushChunks()

    if (err && dev) {
      errorHtml = render(createElement(ErrorDebug, { error: err }))
    }

    return { html, head, errorHtml, chunks }
  }

  const docProps = await loadGetInitialProps(Document, { ...ctx, renderPage })

  if (res.finished) return

  const doc = createElement(Document, {
    __NEXT_DATA__: {
      props,
      pathname,
      query,
      buildId,
      buildStats,
      assetPrefix,
      nextExport,
      err: (err) ? serializeError(dev, err) : null
    },
    dev,
    dir,
    staticMarkup,
    ...docProps
  })

  return '<!DOCTYPE html>' + renderToStaticMarkup(doc)
}

export async function renderScript (req, res, page, opts) {
  try {
    const dist = getConfig(opts.dir).distDir
    const path = join(opts.dir, dist, 'bundles', 'pages', page)
    const realPath = await resolvePath(path)
    await serveStatic(req, res, realPath)
  } catch (err) {
    if (err.code === 'ENOENT') {
      renderScriptError(req, res, page, err, {}, opts)
      return
    }

    throw err
  }
}

export async function renderScriptError (req, res, page, error, customFields, opts) {
  // Asks CDNs and others to not to cache the errored page
  res.setHeader('Cache-Control', 'no-store, must-revalidate')

  if (error.code === 'ENOENT') {
    res.setHeader('Content-Type', 'text/javascript')
    res.end(`
      window.__NEXT_REGISTER_PAGE('${page}', function() {
        var error = new Error('Page does not exist: ${page}')
        error.statusCode = 404

        return { error: error }
      })
    `)
    return
  }

  res.setHeader('Content-Type', 'text/javascript')
  const errorJson = {
    ...errorToJSON(error),
    ...customFields
  }

  res.end(`
    window.__NEXT_REGISTER_PAGE('${page}', function() {
      var error = ${JSON.stringify(errorJson)}
      return { error: error }
    })
  `)
}

export function sendHTML (req, res, html, method) {
  if (res.finished) return
  const etag = generateETag(html)

  if (fresh(req.headers, { etag })) {
    res.statusCode = 304
    res.end()
    return
  }

  res.setHeader('ETag', etag)
  res.setHeader('Content-Type', 'text/html')
  res.setHeader('Content-Length', Buffer.byteLength(html))
  res.end(method === 'HEAD' ? null : html)
}

export function sendJSON (res, obj, method) {
  if (res.finished) return

  const json = JSON.stringify(obj)
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Length', Buffer.byteLength(json))
  res.end(method === 'HEAD' ? null : json)
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

export function serveStatic (req, res, path) {
  return new Promise((resolve, reject) => {
    send(req, path)
    .on('directory', () => {
      // We don't allow directories to be read.
      const err = new Error('No directory access')
      err.code = 'ENOENT'
      reject(err)
    })
    .on('error', reject)
    .pipe(res)
    .on('finish', resolve)
  })
}

async function ensurePage (page, { dir, hotReloader }) {
  if (!hotReloader) return
  if (page === '_error' || page === '_document') return

  await hotReloader.ensurePage(page)
}
