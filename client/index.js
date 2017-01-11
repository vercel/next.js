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

export function render (props, onError = renderErrorComponent) {
  try {
    doRender(props)
  } catch (err) {
    onError(err)
  }
}

async function renderErrorComponent (err) {
  const { pathname, query } = router
  const props = await getInitialProps(ErrorComponent, { err, pathname, query })
  doRender({ Component: ErrorComponent, props, err })
}

function doRender ({ Component, props, err }) {
  Component = Component || lastAppProps.Component
  props = props || lastAppProps.props

  const appProps = { Component, props, err, router, headManager }
  lastAppProps = appProps
  ReactDOM.render(createElement(App, appProps), container)
}

function getInitialProps (Component, ctx) {
  return Component.getInitialProps ? Component.getInitialProps(ctx) : {}
}
