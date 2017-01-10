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
let lastProps

export const router = createRouter(pathname, query, {
  Component,
  ErrorComponent,
  err
})

const headManager = new HeadManager()
const container = document.getElementById('__next')

if (ids && ids.length) rehydrate(ids)

router.subscribe(({ Component, props, err }) => {
  render({ Component, props, err })
})

render({ Component, props, err })

export function render (props = {}) {
  try {
    doRender(props)
  } catch (err) {
    renderError(err)
  }
}

export async function renderError (err) {
  const { pathname, query } = router
  const props = await getInitialProps(ErrorComponent, { err, pathname, query })
  try {
    doRender({ Component: ErrorComponent, props, err })
  } catch (err2) {
    console.error(err2)
  }
}

function doRender ({ Component, props = lastProps, err }) {
  lastProps = props
  const appProps = { Component, props, err, router, headManager }
  ReactDOM.render(createElement(App, appProps), container)
}

function getInitialProps (Component, ctx) {
  return Component.getInitialProps ? Component.getInitialProps(ctx) : {}
}
