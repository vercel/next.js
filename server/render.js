import { join } from 'path'
import { createElement } from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import fs from 'mz/fs'
import send from 'send'
import accepts from 'accepts'
import requireModule from './require'
import read from './read'
import { Router } from '../lib/router'
import Head, { defaultHead } from '../lib/head'
import App from '../lib/app'

export async function render (req, res, pathname, query, opts) {
  const html = await renderToHTML(req, res, pathname, opts)
  sendHTML(res, html)
}

export function renderToHTML (req, res, pathname, query, opts) {
  return doRender(req, res, pathname, query, opts)
}

export async function renderError (err, req, res, pathname, query, opts) {
  const html = await renderErrorToHTML(err, req, res, query, opts)
  sendHTML(res, html)
}

export function renderErrorToHTML (err, req, res, pathname, query, opts = {}) {
  const page = err && opts.dev ? '/_error-debug' : '/_error'
  return doRender(req, res, pathname, query, { ...opts, err, page })
}

async function doRender (req, res, pathname, query, {
  err,
  page,
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
    componentJson,
    errorComponentJson
  ] = await Promise.all([
    Component.getInitialProps ? Component.getInitialProps(ctx) : {},
    read(join(dir, '.next', 'bundles', 'pages', page)),
    read(join(dir, '.next', 'bundles', 'pages', dev ? '_error-debug' : '_error'))
  ])

  const component = JSON.parse(componentJson).component
  const errorComponent = JSON.parse(errorComponentJson).component

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
    try {
      html = render(app)
    } finally {
      head = Head.rewind() || defaultHead()
    }
    return { html, head }
  }

  const docProps = await Document.getInitialProps({ ...ctx, renderPage })

  const doc = createElement(Document, {
    __NEXT_DATA__: {
      component,
      errorComponent,
      props,
      pathname,
      query,
      err: (err && dev) ? errorToJSON(err) : null
    },
    dev,
    staticMarkup,
    ...docProps
  })

  return '<!DOCTYPE html>' + renderToStaticMarkup(doc)
}

export async function renderJSON (req, res, page, { dir = process.cwd() } = {}) {
  const pagePath = join(dir, '.next', 'bundles', 'pages', `${page}.js`)
  return serveStaticWithGzip(req, res, pagePath)
}

export async function renderErrorJSON (err, req, res, { dir = process.cwd(), dev = false } = {}) {
  const page = err && dev ? '/_error-debug' : '/_error'
  const pageSource = await read(join(dir, '.next', 'bundles', 'pages', page))
  const { component } = JSON.parse(pageSource)

  sendJSON(res, {
    component,
    err: err && dev ? errorToJSON(err) : null
  })
}

export function sendHTML (res, html) {
  res.setHeader('Content-Type', 'text/html')
  res.setHeader('Content-Length', Buffer.byteLength(html))
  res.end(html)
}

export function sendJSON (res, obj) {
  const json = JSON.stringify(obj)
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Length', Buffer.byteLength(json))
  res.end(json)
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
  const exists = await fs.exists(gzipPath)
  if (!exists) {
    return serveStatic(req, res, path)
  }

  res.setHeader('Content-Encoding', 'gzip')
  return serveStatic(req, res, gzipPath)
}

export function serveStatic (req, res, path) {
  return new Promise((resolve, reject) => {
    send(req, path)
    .on('error', (err) => {
      if (err.code === 'ENOENT') {
        res.statusCode = 404
        res.end('Not Found')
        resolve()
      } else {
        reject(err)
      }
    })
    .pipe(res)
    .on('finish', resolve)
  })
}
