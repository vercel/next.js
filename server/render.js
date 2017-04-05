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
import ErrorDebug from '../lib/error-debug'

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
    readPage(join(dir, '.next', 'client-bundles', 'pages', page)),
    readPage(join(dir, '.next', 'client-bundles', 'pages', '_error'))
  ])

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

    if (err && dev) {
      errorHtml = render(createElement(ErrorDebug, { error: err }))
    }

    return { html, head, errorHtml }
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
      err: (err && dev) ? errorToJSON(err) : null
    },
    dev,
    component,
    errorComponent,
    staticMarkup,
    ...docProps
  })

  return '<!DOCTYPE html>' + renderToStaticMarkup(doc)
}

export async function renderScript (req, res, page, opts) {
  try {
    const path = join(opts.dir, '.next', 'client-bundles', 'pages', page)
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
  if (error.code === 'ENOENT') {
    res.setHeader('Content-Type', 'text/javascript')
    res.end(`
      function loadPage () {
        var error = new Error('Page not exists: ${page}')
        error.pageNotFound = true
        error.statusCode = 404
        NEXT_PAGE_LOADER.registerPage('${page}', error)
      }
      
      if (window.NEXT_PAGE_LOADER) {
        loadPage()
      } else {
        window.NEXT_LOADED_PAGES = window.NEXT_LOADED_PAGES || []
        window.NEXT_LOADED_PAGES.push(loadPage)
      }
    `)
    return
  }

  res.setHeader('Content-Type', 'text/javascript')
  const errorJson = {
    ...errorToJSON(error),
    ...customFields
  }

  res.end(`
    function loadPage () {
      var error = ${JSON.stringify(errorJson)}
      NEXT_PAGE_LOADER.registerPage('${page}', error)
    }
    
    if (window.NEXT_PAGE_LOADER) {
      loadPage()
    } else {
      window.NEXT_LOADED_PAGES = window.NEXT_LOADED_PAGES || []
      window.NEXT_LOADED_PAGES.push(loadPage)
    }
  `)
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

  if (err.module) {
    // rawRequest contains the filename of the module which has the error.
    const { rawRequest } = err.module
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
