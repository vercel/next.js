import { join } from 'path'
import { existsSync } from 'fs'
import { createElement } from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import stripAnsi from 'strip-ansi'
import resolve from './resolve'
import getConfig from './config'
import { Router } from '../lib/router'
import { loadGetInitialProps } from '../lib/utils'
import Head, { defaultHead } from '../lib/head'
import App from '../lib/app'
import { flushChunks } from '../lib/dynamic'

export function renderToHTML (req, res, pathname, query, opts) {
  return doRender(req, res, pathname, query, opts)
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
  availableChunks,
  dir = process.cwd(),
  dev = false,
  staticMarkup = false,
  overloadCheck = () => false
} = {}) {
  pathname = pathname.replace(/\/index/, '') || '/index'
  page = page || pathname

  await ensurePage(page, { dir, hotReloader })

  const dist = getConfig(dir).distDir
  const nodeDistDir = join(dir, dist, 'server')

  const pageDir = join(nodeDistDir, 'pages')

  const [pagePath, documentPath] = await Promise.all([
    resolve(join(pageDir, page)),
    resolve(join(pageDir, '_document'))
  ])

  let [Component, Document] = [
    require(pagePath),
    require(documentPath)
  ]

  Component = Component.default || Component
  Document = Document.default || Document
  const asPath = req.url
  const ctx = { err, req, res, pathname, query, asPath }
  const props = await loadGetInitialProps(Component, ctx)

  // the response might be finshed on the getinitialprops call
  if (res.finished) return

  const renderPage = (enhancer = Page => Page) => {
    const chunks = loadChunks({ dev, dir, dist, availableChunks })

    if (overloadCheck()) {
      return {
        html: '',
        head: defaultHead(),
        errorHtml: '',
        chunks
      }
    }

    const app = createElement(App, {
      Component: enhancer(Component),
      props,
      router: new Router(pathname, query, asPath)
    })

    const render = staticMarkup ? renderToStaticMarkup : renderToString

    let html
    let head
    let errorHtml = ''

    try {
      if (err) {
        errorHtml = render(app)
      } else {
        html = render(app)
      }
    } finally {
      head = Head.rewind() || defaultHead()
    }

    return { html, head, errorHtml, chunks }
  }

  const docProps = await loadGetInitialProps(Document, { ...ctx, renderPage })

  if (res.finished) return

  if (!Document.prototype || !Document.prototype.isReactComponent) throw new Error('_document.js is not exporting a React element')
  const doc = createElement(Document, {
    __NEXT_DATA__: {
      props,
      pathname,
      query,
      buildId,
      buildStats,
      assetPrefix,
      err: (err) ? serializeError(dev, err) : null
    },
    dev,
    dir,
    staticMarkup,
    ...docProps
  })

  return '<!DOCTYPE html>' + renderToStaticMarkup(doc)
}

function errorToJSON (err) {
  const { name, message, stack } = err
  const json = { name, message: stripAnsi(message), stack: stripAnsi(stack) }

  if (err.module) {
    // rawRequest contains the filename of the module which has the error.
    const { rawRequest } = err.module
    json.module = { rawRequest }
  }

  return json
}

export function serializeError (dev, err) {
  if (err.output && err.output.payload) {
    return err.output.payload
  }
  if (err.status) {
    return { name: err.name, message: err.message, status: err.status }
  }
  if (dev) {
    return errorToJSON(err)
  }

  return { message: '500 - Internal Server Error.' }
}

async function ensurePage (page, { dir, hotReloader }) {
  if (!hotReloader) return
  if (page === '_error' || page === '_document') return

  await hotReloader.ensurePage(page)
}

function loadChunks ({ dev, dir, dist, availableChunks }) {
  const flushedChunks = flushChunks()
  const validChunks = []

  for (var chunk of flushedChunks) {
    const filename = join(dir, dist, 'chunks', chunk)
    const exists = dev ? existsSync(filename) : availableChunks[chunk]
    if (exists) {
      validChunks.push(chunk)
    }
  }

  return validChunks
}
