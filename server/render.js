import { join } from 'path'
import { createElement } from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import send from 'send'
import fs from 'mz/fs'
import accepts from 'accepts'
import mime from 'mime-types'
import requireModule from './require'
import resolvePath from './resolve'
import readPage from './read-page'
import { Router } from '../lib/router'
import { loadGetInitialProps } from '../lib/utils'
import Head, { defaultHead } from '../lib/head'
import App from '../lib/app'

export async function render (req, res, pathname, query, opts) {
  const html = await renderToHTML(req, res, pathname, opts)
  sendHTML(res, html, req.method)
}

export function renderToHTML (req, res, pathname, query, opts) {
  return doRender(req, res, pathname, query, opts)
}

export async function renderError (err, req, res, pathname, query, opts) {
  const html = await renderErrorToHTML(err, req, res, query, opts)
  sendHTML(res, html, req.method)
}

export function renderErrorToHTML (err, req, res, pathname, query, opts = {}) {
  return doRender(req, res, pathname, query, { ...opts, err, page: '_error' })
}

async function doRender (req, res, pathname, query, {
  err,
  page,
  buildId,
  dir = process.cwd(),
  dev = false,
  staticMarkup = false
} = {}) {
  page = page || pathname
  let [Component, Document] = await Promise.all([
    requireModule(join(dir, '.next', 'dist', 'pages', page)),
    requireModule(join(dir, '.next', 'dist', 'pages', '_document'))
  ])
  Component = Component.default || Component
  Document = Document.default || Document
  const ctx = { err, req, res, pathname, query }

  const [
    props,
    component,
    errorComponent
  ] = await Promise.all([
    loadGetInitialProps(Component, ctx),
    readPage(join(dir, '.next', 'bundles', 'pages', page)),
    readPage(join(dir, '.next', 'bundles', 'pages', '_error'))
  ])

  // the response might be finshed on the getinitialprops call
  if (res.finished) return

  const renderPage = () => {
    const app = createElement(App, {
      Component,
      props,
      err,
      router: new Router(pathname, query)
    })

    const render = staticMarkup ? renderToStaticMarkup : renderToString

    let html
    let head
    try {
      html = render(app)
    } finally {
      head = Head.rewind() || defaultHead()
    }
    return { html, head }
  }

  const docProps = await loadGetInitialProps(Document, { ...ctx, renderPage })

  const doc = createElement(Document, {
    __NEXT_DATA__: {
      component,
      errorComponent,
      props,
      pathname,
      query,
      buildId,
      err: (err && dev) ? errorToJSON(err) : null
    },
    dev,
    staticMarkup,
    ...docProps
  })

  return '<!DOCTYPE html>' + renderToStaticMarkup(doc)
}

export async function renderJSON (req, res, page, { dir = process.cwd() } = {}) {
  const pagePath = await resolvePath(join(dir, '.next', 'bundles', 'pages', page))
  return serveStaticWithGzip(req, res, pagePath)
}

export async function renderErrorJSON (err, req, res, { dir = process.cwd(), dev = false } = {}) {
  const component = await readPage(join(dir, '.next', 'bundles', 'pages', '_error'))

  sendJSON(res, {
    component,
    err: err && dev ? errorToJSON(err) : null
  }, req.method)
}

export function sendHTML (res, html, method) {
  if (res.finished) return

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

  if (name === 'ModuleBuildError') {
    // webpack compilation error
    const { module: { rawRequest } } = err
    json.module = { rawRequest }
  }

  return json
}

export async function serveStaticWithGzip (req, res, path) {
  const encoding = accepts(req).encodings(['gzip'])
  if (encoding !== 'gzip') {
    return serveStatic(req, res, path)
  }

  const gzipPath = `${path}.gz`

  try {
    // We need to check the existance of the gzipPath.
    // Getting `ENOENT` error from the `serveStatic` is inconsistent and
    // didn't work on all the cases.
    //
    // And this won't give us a race condition because we know that
    // we don't add gzipped files at runtime.
    await fs.stat(gzipPath)
  } catch (ex) {
    // Handles the error thrown by fs.stat
    if (ex.code === 'ENOENT') {
      // Seems like there's no gzipped file. Let's serve the uncompressed file.
      return serveStatic(req, res, path)
    }

    throw ex
  }

  const contentType = mime.lookup(path) || 'application/octet-stream'
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Encoding', 'gzip')
  return serveStatic(req, res, gzipPath)
}

export function serveStatic (req, res, path) {
  return new Promise((resolve, reject) => {
    send(req, path)
    .on('error', reject)
    .pipe(res)
    .on('finish', resolve)
  })
}
