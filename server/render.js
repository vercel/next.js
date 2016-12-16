import { join } from 'path'
import { parse } from 'url'
import { createElement } from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import requireModule from './require'
import read from './read'
import getConfig from './config'
import Router from '../lib/router'
import Head, { defaultHead } from '../lib/head'
import App from '../lib/app'

export async function render (url, ctx = {}, {
  dir = process.cwd(),
  dev = false,
  staticMarkup = false
} = {}) {
  const path = getPath(url)
  let [Component, Document] = await Promise.all([
    requireModule(join(dir, '.next', 'dist', 'pages', path)),
    requireModule(join(dir, '.next', 'dist', 'pages', '_document'))
  ])
  Component = Component.default || Component
  Document = Document.default || Document

  const [
    props,
    component,
    errorComponent
  ] = await Promise.all([
    Component.getInitialProps ? Component.getInitialProps(ctx) : {},
    read(join(dir, '.next', 'bundles', 'pages', path)),
    read(join(dir, '.next', 'bundles', 'pages', dev ? '_error-debug' : '_error'))
  ])

  const renderPage = () => {
    const app = createElement(App, {
      Component,
      props,
      router: new Router(ctx.req ? ctx.req.url : url)
    })
    const html = (staticMarkup ? renderToStaticMarkup : renderToString)(app)
    const head = Head.rewind() || defaultHead()
    return { html, head }
  }

  const config = await getConfig(dir)

  const docProps = await Document.getInitialProps({ ...ctx, renderPage })

  const doc = createElement(Document, {
    __NEXT_DATA__: {
      component,
      errorComponent,
      props,
      err: (ctx.err && dev) ? errorToJSON(ctx.err) : null
    },
    dev,
    staticMarkup,
    cdn: config.cdn,
    ...docProps
  })

  return '<!DOCTYPE html>' + renderToStaticMarkup(doc)
}

export async function renderJSON (url, { dir = process.cwd() } = {}) {
  const path = getPath(url)
  const component = await read(join(dir, '.next', 'bundles', 'pages', path))
  return { component }
}

export function errorToJSON (err) {
  const { name, message, stack } = err
  const json = { name, message, stack }

  if (name === 'ModuleBuildError') {
    // webpack compilation error
    const { module: { rawRequest } } = err
    json.module = { rawRequest }
  }

  return json
}

function getPath (url) {
  return parse(url || '/').pathname.replace(/\.json$/, '')
}
