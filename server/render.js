import { relative, resolve } from 'path'
import { parse } from 'url'
import { createElement } from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import fs from 'mz/fs'
import requireResolve from './resolve'
import read from './read'
import Router from '../lib/router'
import Document from '../lib/document'
import Head from '../lib/head'
import App from '../lib/app'
import { StyleSheetServer } from '../lib/css'

export async function render (url, ctx = {}, {
  dir = process.cwd(),
  dev = false,
  staticMarkup = false
} = {}) {
  const path = getPath(url)
  const p = await requireResolve(resolve(dir, '.next', 'pages', path))
  const mod = require(p)
  const Component = mod.default || mod

  const props = await (Component.getInitialProps ? Component.getInitialProps(ctx) : {})
  const component = await read(resolve(dir, '.next', '_bundles', 'pages', path))

  const { html, css } = StyleSheetServer.renderStatic(() => {
    const app = createElement(App, {
      Component,
      props,
      router: new Router(ctx.req ? ctx.req.url : url)
    })

    return (staticMarkup ? renderToStaticMarkup : renderToString)(app)
  })

  const head = Head.rewind() || []

  const doc = createElement(Document, {
    html,
    head,
    css,
    data: {
      component,
      props,
      classNames: css.renderedClassNames
    },
    hotReload: false,
    dev,
    staticMarkup
  })

  return '<!DOCTYPE html>' + renderToStaticMarkup(doc)
}

export async function renderJSON (url, { dir = process.cwd() } = {}) {
  const path = getPath(url)
  const component = await read(resolve(dir, '.next', '_bundles', 'pages', path))
  return { component }
}

function getPath (url) {
  return parse(url || '/').pathname.slice(1).replace(/\.json$/, '')
}
