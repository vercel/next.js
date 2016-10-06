import { relative, resolve } from 'path'
import { createElement } from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import fs from 'mz/fs'
import Document from '../lib/document'
import App from '../lib/app'

export async function render (path, req, res, { root = process.cwd() } = {}) {
  const mod = require(resolve(root, '.next', 'pages', path)) || {}
  const Component = mod.default

  let props = {}
  if (Component.getInitialProps) {
    props = await Component.getInitialProps({ req, res })
  }

  const bundlePath = resolve(root, '.next', '.next', 'pages', (path || 'index') + '.js')
  const component = await fs.readFile(bundlePath, 'utf8')

  const app = createElement(App, {
    Component,
    props,
    router: {}
  })

  const doc = createElement(Document, {
    head: [],
    html: renderToString(app),
    data: { component },
    hotReload: false
  })

  return '<!DOCTYPE html>' + renderToStaticMarkup(doc)
}

export async function renderJSON (path) {
}
