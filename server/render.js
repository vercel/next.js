import { join } from 'path'
import { createElement } from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import stripAnsi from 'strip-ansi'
import { Router } from '../lib/router'
import Head, { defaultHead } from '../lib/head'
import App from '../lib/app'

export async function renderToHTML (req, res, pathname, query, opts) {
  const page = await doPageRender(req, res, pathname, query, opts)
  return doDocRender(page, {}, opts)
}

export async function renderErrorToHTML (err, req, res, pathname, query, opts) {
  const page = await doPageRender(req, res, pathname, query, { ...opts, err, page: '_error' })
  return doDocRender(page, {}, opts)
}

export async function doPageRender (req, res, pathname, query, {
  dev,
  err,
  publicPath,
  page,
  hotReloader,
  dir,
  overloadCheck = () => false,
  enhancer = Page => Page
}) {
  pathname = pathname.replace(/\/index/, '') || '/index'
  page = page || pathname

  await ensurePage(page, { dir, hotReloader })

  const pageDir = join(dir, '.next', 'server', 'pages')

  let Component = require(join(pageDir, page))
  Component = Component.default || Component

  const asPath = req.url
  const props = await Component.getInitialProps({ err, req, res, pathname, query, asPath })

  if (overloadCheck()) {
    return {
      pathname,
      query,
      props,
      head: renderToString(defaultHead)
    }
  }

  const app = createElement(App, {
    Component: enhancer(Component),
    props,
    router: new Router(pathname, query, asPath)
  })

  let html
  let head
  let errorHtml

  try {
    if (err) {
      errorHtml = renderToString(app)
    } else {
      html = renderToString(app)
    }
  } finally {
    head = Head.rewind() || defaultHead
  }

  return {
    err: serializeError(dev, err),
    pathname,
    query,
    props,
    head: renderToString(head),
    html,
    publicPath,
    errorHtml
  }
}

export async function doDocRender (page, initialProps, { dev, dir, publicPath }) {
  const pageDir = join(dir, '.next', 'server', 'pages')

  let Document = require(join(pageDir, '_document'))
  Document = Document.default || Document

  const docProps = await Document.getInitialProps({ initialProps, renderPage: () => page })
  const doc = createElement(Document, {
    __NEXT_DATA__: {
      props: docProps.props,
      pathname: docProps.pathname,
      query: docProps.query,
      publicPath: docProps.publicPath || publicPath,
      err: docProps.err
    },
    dev,
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
  if (!err) {
    return undefined
  }
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
