import { createElement } from 'react'
import ReactDOM from 'react-dom'
import HeadManager from './head-manager'
import { rehydrate } from '../lib/css'
import { createRouter } from '../lib/router'
import App from '../lib/app'
import evalScript from '../lib/eval-script'
import { loadGetInitialProps } from '../lib/utils'

const {
  CustomEvent,
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
let lastAppProps

export const router = createRouter(pathname, query, {
  Component,
  ErrorComponent,
  err
})

const headManager = new HeadManager()
const container = document.getElementById('__next')

export default (onError) => {
  if (ids && ids.length) rehydrate(ids)

  router.subscribe(({ Component, props, err }) => {
    render({ Component, props, err }, onError)
  })

  render({ Component, props, err }, onError)
}

export async function render (props, onError = renderErrorComponent) {
  try {
    await doRender(props)
  } catch (err) {
    await onError(err)
  }
}

async function renderErrorComponent (err) {
  const { pathname, query } = router
  const props = await loadGetInitialProps(ErrorComponent, { err, pathname, query })
  await doRender({ Component: ErrorComponent, props, err })
}

async function doRender ({ Component, props, err }) {
  if (!props && Component &&
    Component !== ErrorComponent &&
    lastAppProps.Component === ErrorComponent) {
    // fetch props if ErrorComponent was replaced with a page component by HMR
    const { pathname, query } = router
    props = await loadGetInitialProps(Component, { err, pathname, query })
  }

  // Try/catch is needed because IE11 has a CustomEvent implementation without contructor
  try {
    const event = new CustomEvent('before-reactdom-render', { detail: { Component } })
    document.dispatchEvent(event)
  } catch (e) {}

  Component = Component || lastAppProps.Component
  props = props || lastAppProps.props

  const appProps = { Component, props, err, router, headManager }
  ReactDOM.render(createElement(App, appProps), container)

  // Try/catch is needed because IE11 has a CustomEvent implementation without contructor
  try {
    const event = new CustomEvent('after-reactdom-render', { detail: { Component } })
    document.dispatchEvent(event)
  } catch (e) {}

  lastAppProps = appProps
}
