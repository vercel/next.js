import { join } from 'path'
import { createElement } from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import send from 'send'
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
  buildStats,
  hotReloader,
  dir = process.cwd(),
  dev = false,
  staticMarkup = false
} = {}) {
  page = page || pathname

  await ensurePage(page, { dir, hotReloader })

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
      err: dev ? err : null,
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

  if (res.finished) return

  const doc = createElement(Document, {
    __NEXT_DATA__: {
      component,
      errorComponent,
      props,
      pathname,
      query,
      buildId,
      buildStats,
      err: (err && dev) ? errorToJSON(err) : null
    },
    dev,
    staticMarkup,
    ...docProps
  })

  return '<!DOCTYPE html>' + renderToStaticMarkup(doc)
}

export async function renderJSON (req, res, page, { dir = process.cwd(), hotReloader } = {}) {
  await ensurePage(page, { dir, hotReloader })
  const pagePath = await resolvePath(join(dir, '.next', 'bundles', 'pages', page))
  return serveStatic(req, res, pagePath)
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
