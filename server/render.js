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
  const modResult = await requireModule(join(distBase, path), distBase)
  const Component = modResult.module.default || modResult.module

  const props = await (Component.getInitialProps ? Component.getInitialProps({ ...ctx, params: modResult.params }) : {})
  const bundlesBase = join(dir, '.next', 'bundles', 'pages')
  const dataResult = await read(join(bundlesBase, path), bundlesBase)
  const component = dataResult.data

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
      err: ctx.err ? errorToJSON(ctx.err) : null,
      params: dataResult.params
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
  const result = await read(join(base, path), base)
  return { component: result.data, params: result.params }
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
