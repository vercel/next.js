import { createElement } from 'react'
import ReactDOM from 'react-dom'
import HeadManager from './head-manager'
import { rehydrate } from '../lib/css'
import { createRouter } from '../lib/router'
import App from '../lib/app'
import evalScript from '../lib/eval-script'

const {
  __NEXT_DATA__: {
    component,
    errorComponent,
    props,
    ids,
    err,
    pathname,
    query
  }
} = window

const Component = evalScript(component).default
const ErrorComponent = evalScript(errorComponent).default

export const router = createRouter(pathname, query, {
  Component,
  ErrorComponent,
  ctx: { err }
})

const headManager = new HeadManager()
const container = document.getElementById('__next')
const defaultProps = { Component, ErrorComponent, props, router, headManager }

if (ids && ids.length) rehydrate(ids)

render()

export function render (props = {}) {
  try {
    doRender(props)
  } catch (err) {
    renderError(err)
  }
}

export async function renderError (err) {
  const { pathname, query } = router
  const props = await ErrorComponent.getInitialProps({ err, pathname, query })
  try {
    doRender({ Component: ErrorComponent, props })
  } catch (err2) {
    console.error(err2)
  }
}

function doRender (props) {
  const appProps = { ...defaultProps, ...props }
  ReactDOM.render(createElement(App, appProps), container)
}
