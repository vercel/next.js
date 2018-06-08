import React from 'react'
import ReactDOM from 'react-dom'
import HeadManager from './head-manager'
import { createRouter } from '../lib/router'
import EventEmitter from '../lib/EventEmitter'
import { loadGetInitialProps, getURL } from '../lib/utils'
import PageLoader from '../lib/page-loader'
import * as asset from '../lib/asset'
import * as envConfig from '../lib/runtime-config'
import ErrorBoundary from './error-boundary'

// Polyfill Promise globally
// This is needed because Webpack2's dynamic loading(common chunks) code
// depends on Promise.
// So, we need to polyfill it.
// See: https://github.com/webpack/webpack/issues/4254
if (!window.Promise) {
  window.Promise = Promise
}

const {
  __NEXT_DATA__: {
    props,
    err,
    page,
    pathname,
    query,
    buildId,
    chunks,
    assetPrefix,
    runtimeConfig
  },
  location
} = window

// With dynamic assetPrefix it's no longer possible to set assetPrefix at the build time
// So, this is how we do it in the client side at runtime
__webpack_public_path__ = `${assetPrefix}/_next/webpack/` //eslint-disable-line
// Initialize next/asset with the assetPrefix
asset.setAssetPrefix(assetPrefix)
// Initialize next/config with the environment configuration
envConfig.setConfig({
  serverRuntimeConfig: {},
  publicRuntimeConfig: runtimeConfig
})

const asPath = getURL()

const pageLoader = new PageLoader(buildId, assetPrefix)
window.__NEXT_LOADED_PAGES__.forEach(({ route, fn }) => {
  pageLoader.registerPage(route, fn)
})
delete window.__NEXT_LOADED_PAGES__

window.__NEXT_LOADED_CHUNKS__.forEach(({ chunkName, fn }) => {
  pageLoader.registerChunk(chunkName, fn)
})
delete window.__NEXT_LOADED_CHUNKS__

window.__NEXT_REGISTER_PAGE = pageLoader.registerPage.bind(pageLoader)
window.__NEXT_REGISTER_CHUNK = pageLoader.registerChunk.bind(pageLoader)

const headManager = new HeadManager()
const appContainer = document.getElementById('__next')
const errorContainer = document.getElementById('__next-error')

let lastAppProps
export let router
export let ErrorComponent
let DevErrorOverlay
let Component
let App
let stripAnsi = (s) => s
let applySourcemaps = (e) => e

export const emitter = new EventEmitter()

export default async ({
  DevErrorOverlay: passedDevErrorOverlay,
  stripAnsi: passedStripAnsi,
  applySourcemaps: passedApplySourcemaps
} = {}) => {
  // Wait for all the dynamic chunks to get loaded
  for (const chunkName of chunks) {
    await pageLoader.waitForChunk(chunkName)
  }

  stripAnsi = passedStripAnsi || stripAnsi
  applySourcemaps = passedApplySourcemaps || applySourcemaps
  DevErrorOverlay = passedDevErrorOverlay
  ErrorComponent = await pageLoader.loadPage('/_error')
  App = await pageLoader.loadPage('/_app')

  let initialErr = err

  try {
    Component = await pageLoader.loadPage(page)

    if (typeof Component !== 'function') {
      throw new Error(`The default export is not a React Component in page: "${pathname}"`)
    }
  } catch (error) {
    // This catches errors like throwing in the top level of a module
    initialErr = error
  }

  router = createRouter(pathname, query, asPath, {
    initialProps: props,
    pageLoader,
    App,
    Component,
    ErrorComponent,
    err: initialErr
  })

  router.subscribe(({ App, Component, props, hash, err }) => {
    render({ App, Component, props, err, hash, emitter })
  })

  const hash = location.hash.substring(1)
  render({ App, Component, props, hash, err: initialErr, emitter })

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
    if (err.abort) return
    await renderError({...props, err})
  }
}

// This method handles all runtime and debug errors.
// 404 and 500 errors are special kind of errors
// and they are still handle via the main render method.
export async function renderError (props) {
  const {err, errorInfo} = props

  // In development we apply sourcemaps to the error
  if (process.env.NODE_ENV !== 'production') {
    await applySourcemaps(err)
  }

  const str = stripAnsi(`${err.message}\n${err.stack}${errorInfo ? `\n\n${errorInfo.componentStack}` : ''}`)
  console.error(str)

  if (process.env.NODE_ENV !== 'production') {
    // We need to unmount the current app component because it's
    // in the inconsistant state.
    // Otherwise, we need to face issues when the issue is fixed and
    // it's get notified via HMR
    ReactDOM.unmountComponentAtNode(appContainer)
    renderReactElement(<DevErrorOverlay error={err} />, errorContainer)
    return
  }

  // In production we do a normal render with the `ErrorComponent` as component.
  // `App` will handle the calling of `getInitialProps`, which will include the `err` on the context
  await doRender({...props, err, Component: ErrorComponent})
}

async function doRender ({ App, Component, props, hash, err, emitter: emitterProp = emitter }) {
  // Usual getInitialProps fetching is handled in next/router
  // this is for when ErrorComponent gets replaced by Component by HMR
  if (!props && Component &&
    Component !== ErrorComponent &&
    lastAppProps.Component === ErrorComponent) {
    const { pathname, query, asPath } = router
    props = await loadGetInitialProps(App, {Component, router, ctx: {err, pathname, query, asPath}})
  }

  Component = Component || lastAppProps.Component
  props = props || lastAppProps.props

  const appProps = { Component, hash, err, router, headManager, ...props }
  // lastAppProps has to be set before ReactDom.render to account for ReactDom throwing an error.
  lastAppProps = appProps

  emitterProp.emit('before-reactdom-render', { Component, ErrorComponent, appProps })

  // We need to clear any existing runtime error messages
  ReactDOM.unmountComponentAtNode(errorContainer)

  let onError = null

  if (process.env.NODE_ENV !== 'development') {
    onError = async (error, errorInfo) => {
      try {
        await renderError({App, err: error, errorInfo})
      } catch (err) {
        console.error('Error while rendering error page: ', err)
      }
    }
  }

  // In development we render a wrapper component that catches runtime errors.
  renderReactElement((
    <ErrorBoundary ErrorReporter={DevErrorOverlay} onError={onError}>
      <App {...appProps} />
    </ErrorBoundary>
  ), appContainer)

  emitterProp.emit('after-reactdom-render', { Component, ErrorComponent, appProps })
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
