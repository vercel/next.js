import React from 'react'
import ReactDOM from 'react-dom'
import HeadManager from './head-manager'
import { createRouter } from 'next/router'
import mitt from 'next-server/dist/lib/mitt'
import { loadGetInitialProps, getURL } from 'next-server/dist/lib/utils'
import PageLoader from './page-loader'
import * as envConfig from 'next-server/config'
import ErrorBoundary from './error-boundary'
import Loadable from 'next-server/dist/lib/loadable'
import { HeadManagerContext } from 'next-server/dist/lib/head-manager-context'

// Polyfill Promise globally
// This is needed because Webpack's dynamic loading(common chunks) code
// depends on Promise.
// So, we need to polyfill it.
// See: https://webpack.js.org/guides/code-splitting/#dynamic-imports
if (!window.Promise) {
  window.Promise = Promise
}

const data = JSON.parse(document.getElementById('__NEXT_DATA__').textContent)
window.__NEXT_DATA__ = data

const {
  props,
  err,
  page,
  query,
  buildId,
  assetPrefix,
  runtimeConfig,
  dynamicIds
} = data

const prefix = assetPrefix || ''

// With dynamic assetPrefix it's no longer possible to set assetPrefix at the build time
// So, this is how we do it in the client side at runtime
__webpack_public_path__ = `${prefix}/_next/` //eslint-disable-line
// Initialize next/config with the environment configuration
envConfig.setConfig({
  serverRuntimeConfig: {},
  publicRuntimeConfig: runtimeConfig
})

const asPath = getURL()

const pageLoader = new PageLoader(buildId, prefix)
const register = ([r, f]) => pageLoader.registerPage(r, f)
if (window.__NEXT_P) {
  window.__NEXT_P.map(register)
}
window.__NEXT_P = []
window.__NEXT_P.push = register

const headManager = new HeadManager()
const appContainer = document.getElementById('__next')

let lastAppProps
let webpackHMR
export let router
export let ErrorComponent
let Component
let App

export const emitter = mitt()

export default async ({
  webpackHMR: passedWebpackHMR
} = {}) => {
  // This makes sure this specific line is removed in production
  if (process.env.NODE_ENV === 'development') {
    webpackHMR = passedWebpackHMR
  }
  App = await pageLoader.loadPage('/_app')

  let initialErr = err

  try {
    Component = await pageLoader.loadPage(page)

    if (process.env.NODE_ENV !== 'production') {
      const { isValidElementType } = require('react-is')
      if (!isValidElementType(Component)) {
        throw new Error(`The default export is not a React Component in page: "${page}"`)
      }
    }
  } catch (error) {
    // This catches errors like throwing in the top level of a module
    initialErr = error
  }

  await Loadable.preloadReady(dynamicIds || [])

  router = createRouter(page, query, asPath, {
    initialProps: props,
    pageLoader,
    App,
    Component,
    err: initialErr
  })

  router.subscribe(({ App, Component, props, err }) => {
    render({ App, Component, props, err, emitter })
  })

  render({ App, Component, props, err: initialErr, emitter })

  return emitter
}

export async function render (props) {
  if (props.err) {
    await renderError(props)
    return
  }

  try {
    await doRender(props)
  } catch (err) {
    await renderError({ ...props, err })
  }
}

// This method handles all runtime and debug errors.
// 404 and 500 errors are special kind of errors
// and they are still handle via the main render method.
export async function renderError (props) {
  const { App, err } = props

  if (process.env.NODE_ENV !== 'production') {
    return webpackHMR.reportRuntimeError(
      webpackHMR.prepareError(err)
    )
  }

  // Make sure we log the error to the console, otherwise users can't track down issues.
  console.error(err)

  ErrorComponent = await pageLoader.loadPage('/_error')

  // In production we do a normal render with the `ErrorComponent` as component.
  // If we've gotten here upon initial render, we can use the props from the server.
  // Otherwise, we need to call `getInitialProps` on `App` before mounting.
  const initProps = props.props
    ? props.props
    : await loadGetInitialProps(App, { Component: ErrorComponent, router, ctx: { err, pathname: page, query, asPath } })

  await doRender({ ...props, err, Component: ErrorComponent, props: initProps })
}

let isInitialRender = true
function renderReactElement (reactEl, domEl) {
  // The check for `.hydrate` is there to support React alternatives like preact
  if (isInitialRender && typeof ReactDOM.hydrate === 'function') {
    ReactDOM.hydrate(reactEl, domEl)
    isInitialRender = false
  } else {
    ReactDOM.render(reactEl, domEl)
  }
}

async function doRender ({ App, Component, props, err, emitter: emitterProp = emitter }) {
  // Usual getInitialProps fetching is handled in next/router
  // this is for when ErrorComponent gets replaced by Component by HMR
  if (!props && Component &&
    Component !== ErrorComponent &&
    lastAppProps.Component === ErrorComponent) {
    const { pathname, query, asPath } = router
    props = await loadGetInitialProps(App, { Component, router, ctx: { err, pathname, query, asPath } })
  }

  Component = Component || lastAppProps.Component
  props = props || lastAppProps.props

  const appProps = { Component, err, router, headManager, ...props }
  // lastAppProps has to be set before ReactDom.render to account for ReactDom throwing an error.
  lastAppProps = appProps

  emitterProp.emit('before-reactdom-render', { Component, ErrorComponent, appProps })

  // In development runtime errors are caught by react-error-overlay.
  if (process.env.NODE_ENV === 'development') {
    renderReactElement((
      <HeadManagerContext.Provider value={headManager.updateHead}>
        <App {...appProps} />
      </HeadManagerContext.Provider>
    ), appContainer)
  } else {
    // In production we catch runtime errors using componentDidCatch which will trigger renderError.
    const onError = async (error) => {
      try {
        await renderError({ App, err: error })
      } catch (err) {
        console.error('Error while rendering error page: ', err)
      }
    }
    renderReactElement((
      <ErrorBoundary onError={onError}>
        <HeadManagerContext.Provider value={headManager.updateHead}>
          <App {...appProps} />
        </HeadManagerContext.Provider>
      </ErrorBoundary>
    ), appContainer)
  }

  emitterProp.emit('after-reactdom-render', { Component, ErrorComponent, appProps })
}
