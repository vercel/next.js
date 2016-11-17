import { join } from 'path'
import { parse } from 'url'
import { createElement } from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import { renderStatic } from 'glamor/server'
import requireModule from './require'
import read from './read'
import getConfig from './config'
import Router from '../lib/router'
import Document from '../lib/document'
import Head, {defaultHead} from '../lib/head'
import App from '../lib/app'

export async function render (url, ctx = {}, {
  dir = process.cwd(),
  dev = false,
  staticMarkup = false
} = {}) {
  const path = getPath(url)
  const mod = await requireModule(join(dir, '.next', 'dist', 'pages', path))
  const Component = mod.default || mod

  const props = await (Component.getInitialProps ? Component.getInitialProps(ctx) : {})
  const component = await read(join(dir, '.next', 'bundles', 'pages', path))

  const { html, css, ids } = renderStatic(() => {
    const app = createElement(App, {
      Component,
      props,
      router: new Router(ctx.req ? ctx.req.url : url)
    })

    return (staticMarkup ? renderToStaticMarkup : renderToString)(app)
  })

  const head = Head.rewind() || defaultHead()
  const config = await getConfig(dir)

  const doc = createElement(Document, {
    html,
    head,
    css,
    data: {
      component,
      props,
      ids: ids,
      err: (ctx.err && dev) ? errorToJSON(ctx.err) : null
    },
    dev,
    staticMarkup,
    cdn: config.cdn
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
