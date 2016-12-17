import { join } from 'path'
import { createElement } from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import requireModule from './require'
import read from './read'
import Router from '../lib/router'
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
    component,
    errorComponent
  ] = await Promise.all([
    Component.getInitialProps ? Component.getInitialProps(ctx) : {},
    read(join(dir, '.next', 'bundles', 'pages', page)),
    read(join(dir, '.next', 'bundles', 'pages', dev ? '_error-debug' : '_error'))
  ])

  // the response might be finshed on the getinitialprops call
  if (res.finished) return

  const renderPage = () => {
    const app = createElement(App, {
      Component,
      props,
      router: new Router(pathname, query)
    })
    const html = (staticMarkup ? renderToStaticMarkup : renderToString)(app)
    const head = Head.rewind() || defaultHead()
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

export async function renderJSON (res, page, { dir = process.cwd() } = {}) {
  const component = await read(join(dir, '.next', 'bundles', 'pages', page))
  sendJSON(res, { component })
}

export async function renderErrorJSON (err, res, { dir = process.cwd(), dev = false } = {}) {
  const page = err && dev ? '/_error-debug' : '/_error'
  const component = await read(join(dir, '.next', 'bundles', 'pages', page))
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
