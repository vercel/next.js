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
import Head from '../lib/head'
import App from '../lib/app'

export async function render (url, ctx = {}, {
  dir = process.cwd(),
  dev = false,
  staticMarkup = false
} = {}) {
  const distBase = join(dir, '.next', 'dist', 'pages')
  const path = getPath(url)
  const result = await requireModule(join(distBase, path), distBase)
  const Component = result.module.default || result.module

  const props = await (Component.getInitialProps ? Component.getInitialProps({ ...ctx, params: result.params }) : {})
  const bundlesBase = join(dir, '.next', 'bundles', 'pages')
  const component = await read(join(bundlesBase, path), bundlesBase)

  const { html, css, ids } = renderStatic(() => {
    const app = createElement(App, {
      Component,
      props,
      router: new Router(ctx.req ? ctx.req.url : url)
    })

    return (staticMarkup ? renderToStaticMarkup : renderToString)(app)
  })

  const head = Head.rewind() || []
  const config = await getConfig(dir)

  const doc = createElement(Document, {
    html,
    head,
    css,
    data: {
      component,
      props,
      ids: ids,
      err: ctx.err ? errorToJSON(ctx.err) : null
    },
    dev,
    staticMarkup,
    cdn: config.cdn
  })

  return '<!DOCTYPE html>' + renderToStaticMarkup(doc)
}

export async function renderJSON (url, { dir = process.cwd() } = {}) {
  const base = join(dir, '.next', 'bundles', 'pages')
  const path = getPath(url)
  const component = await read(join(base, path), base)
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
