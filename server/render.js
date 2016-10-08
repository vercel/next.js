import { relative, resolve } from 'path'
import { createElement } from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import fs from 'mz/fs'
import Router from '../lib/router'
import Document from '../lib/document'
import Head from '../lib/head'
import App from '../lib/app'
import { StyleSheetServer } from '../lib/css'

export async function render (path, req, res, { dir = process.cwd(), dev = false } = {}) {
  const mod = require(resolve(dir, '.next', 'pages', path))
  const Component = mod.default || mod

  let props = {}
  if (Component.getInitialProps) {
    props = await Component.getInitialProps({ req, res })
  }

  const bundlePath = resolve(dir, '.next', '_bundles', 'pages', (path || 'index') + '.js')
  const component = await fs.readFile(bundlePath, 'utf8')

  const { html, css } = StyleSheetServer.renderStatic(() => {
    const app = createElement(App, {
      Component,
      props,
      router: new Router(req.url)
    })

    return renderToString(app)
  })

  const head = Head.rewind() || []

  const doc = createElement(Document, {
    html,
    head,
    css,
    data: { component, props },
    hotReload: false,
    dev
  })

  return '<!DOCTYPE html>' + renderToStaticMarkup(doc)
}

export async function renderJSON (path, { dir = process.cwd() }) {
  const bundlePath = resolve(dir, '.next', '_bundles', 'pages', (path || 'index') + '.js')
  const component = await fs.readFile(bundlePath, 'utf8')
  return { component }
}
