/* global location */
import React from 'react'
import ReactDOM from 'react-dom'
import HeadManager from './head-manager'
import { createRouter, makePublicRouterInstance } from 'next/router'
import mitt from '../next-server/lib/mitt'
import { loadGetInitialProps, getURL, ST } from '../next-server/lib/utils'
import PageLoader from './page-loader'
import * as envConfig from '../next-server/lib/runtime-config'
import { HeadManagerContext } from '../next-server/lib/head-manager-context'
import { RouterContext } from '../next-server/lib/router-context'
import { parse as parseQs, stringify as stringifyQs } from 'querystring'
import { isDynamicRoute } from '../next-server/lib/router/utils/is-dynamic'

/// <reference types="react-dom/experimental" />

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

export const version = process.env.__NEXT_VERSION

const {
  props,
  err,
  page,
  query,
  buildId,
  assetPrefix,
  runtimeConfig,
  dynamicIds,
} = data

const prefix = assetPrefix || ''

// With dynamic assetPrefix it's no longer possible to set assetPrefix at the build time
// So, this is how we do it in the client side at runtime
__webpack_public_path__ = `${prefix}/_next/` //eslint-disable-line
// Initialize next/config with the environment configuration
envConfig.setConfig({
  serverRuntimeConfig: {},
  publicRuntimeConfig: runtimeConfig || {},
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
const appElement = document.getElementById('__next')

let lastAppProps
let webpackHMR
export let router
let ErrorComponent
let Component
let App, onPerfEntry

class Container extends React.Component {
  componentDidCatch(err, info) {
    this.props.fn(err, info)
  }

  componentDidMount() {
    this.scrollToHash()

    if (process.env.__NEXT_PLUGINS) {
      // eslint-disable-next-line
      import('next-plugin-loader?middleware=unstable-post-hydration!')
        .then(mod => {
          return mod.default()
        })
        .catch(err => {
          console.error('Error calling post-hydration for plugins', err)
        })
    }

    // If page was exported and has a querystring
    // If it's a dynamic route or has a querystring
    if (
      (data.nextExport &&
        (isDynamicRoute(router.pathname) || location.search)) ||
      (Component.__NEXT_SPR && location.search)
    ) {
      // update query on mount for exported pages
      router.replace(
        router.pathname +
          '?' +
          stringifyQs({
            ...router.query,
            ...parseQs(location.search.substr(1)),
          }),
        asPath,
        {
          // WARNING: `_h` is an internal option for handing Next.js
          // client-side hydration. Your app should _never_ use this property.
          // It may change at any time without notice.
          _h: 1,
          shallow: true,
        }
      )
    }
  }

  componentDidUpdate() {
    this.scrollToHash()
  }

  scrollToHash() {
    let { hash } = location
    hash = hash && hash.substring(1)
    if (!hash) return

    const el = document.getElementById(hash)
    if (!el) return

    // If we call scrollIntoView() in here without a setTimeout
    // it won't scroll properly.
    setTimeout(() => el.scrollIntoView(), 0)
  }

  render() {
    return this.props.children
  }
}

export const emitter = mitt()

export default async ({ webpackHMR: passedWebpackHMR } = {}) => {
  // This makes sure this specific lines are removed in production
  if (process.env.NODE_ENV === 'development') {
    webpackHMR = passedWebpackHMR
  }
  const { page: app, mod } = await pageLoader.loadPageScript('/_app')
  App = app
  if (mod && mod.unstable_onPerformanceData) {
    onPerfEntry = function({ name, startTime, value, duration }) {
      mod.unstable_onPerformanceData({ name, startTime, value, duration })
    }
  }

  let initialErr = err

  try {
    Component = await pageLoader.loadPage(page)

    if (process.env.NODE_ENV !== 'production') {
      const { isValidElementType } = require('react-is')
      if (!isValidElementType(Component)) {
        throw new Error(
          `The default export is not a React Component in page: "${page}"`
        )
      }
    }
  } catch (error) {
    // This catches errors like throwing in the top level of a module
    initialErr = error
  }

  if (window.__NEXT_PRELOADREADY) {
    await window.__NEXT_PRELOADREADY(dynamicIds)
  }

  router = createRouter(page, query, asPath, {
    initialProps: props,
    pageLoader,
    App,
    Component,
    wrapApp,
    err: initialErr,
    subscription: ({ Component, props, err }, App) => {
      render({ App, Component, props, err })
    },
  })

  // call init-client middleware
  if (process.env.__NEXT_PLUGINS) {
    // eslint-disable-next-line
    import('next-plugin-loader?middleware=on-init-client!')
      .then(mod => {
        return mod.default({ router })
      })
      .catch(err => {
        console.error('Error calling client-init for plugins', err)
      })
  }

  const renderCtx = { App, Component, props, err: initialErr }
  render(renderCtx)

  return emitter
}

export async function render(props) {
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
export async function renderError(props) {
  const { App, err } = props

  // In development runtime errors are caught by react-error-overlay
  // In production we catch runtime errors using componentDidCatch which will trigger renderError
  if (process.env.NODE_ENV !== 'production') {
    return webpackHMR.reportRuntimeError(webpackHMR.prepareError(err))
  }
  if (process.env.__NEXT_PLUGINS) {
    // eslint-disable-next-line
    import('next-plugin-loader?middleware=on-error-client!')
      .then(mod => {
        return mod.default({ err })
      })
      .catch(err => {
        console.error('error calling on-error-client for plugins', err)
      })
  }

  // Make sure we log the error to the console, otherwise users can't track down issues.
  console.error(err)

  ErrorComponent = await pageLoader.loadPage('/_error')

  // In production we do a normal render with the `ErrorComponent` as component.
  // If we've gotten here upon initial render, we can use the props from the server.
  // Otherwise, we need to call `getInitialProps` on `App` before mounting.
  const AppTree = wrapApp(App)
  const appCtx = {
    Component: ErrorComponent,
    AppTree,
    router,
    ctx: { err, pathname: page, query, asPath, AppTree },
  }

  const initProps = props.props
    ? props.props
    : await loadGetInitialProps(App, appCtx)

  await doRender({ ...props, err, Component: ErrorComponent, props: initProps })
}

// If hydrate does not exist, eg in preact.
let isInitialRender = typeof ReactDOM.hydrate === 'function'
let reactRoot = null
function renderReactElement(reactEl, domEl) {
  // mark start of hydrate/render
  if (ST) {
    performance.mark('beforeRender')
  }

  if (process.env.__NEXT_REACT_MODE !== 'legacy') {
    let callback = markRenderComplete
    if (!reactRoot) {
      const opts = { hydrate: true }
      reactRoot =
        process.env.__NEXT_REACT_MODE === 'concurrent'
          ? ReactDOM.createRoot(domEl, opts)
          : ReactDOM.createBlockingRoot(domEl, opts)
      callback = markHydrateComplete
    }
    reactRoot.render(reactEl, callback)
  } else {
    // The check for `.hydrate` is there to support React alternatives like preact
    if (isInitialRender) {
      ReactDOM.hydrate(reactEl, domEl, markHydrateComplete)
      isInitialRender = false
    } else {
      ReactDOM.render(reactEl, domEl, markRenderComplete)
    }
  }

  if (onPerfEntry && ST) {
    if (!(PerformanceObserver in window)) {
      window.addEventListener('load', () => {
        performance.getEntriesByType('paint').forEach(onPerfEntry)
      })
    } else {
      const observer = new PerformanceObserver(list => {
        list.getEntries().forEach(onPerfEntry)
      })
      observer.observe({ entryTypes: ['paint'] })
    }
  }
}

function markHydrateComplete() {
  if (!ST) return

  performance.mark('afterHydrate') // mark end of hydration

  performance.measure(
    'Next.js-before-hydration',
    'navigationStart',
    'beforeRender'
  )
  performance.measure('Next.js-hydration', 'beforeRender', 'afterHydrate')
  if (onPerfEntry) {
    performance.getEntriesByName('Next.js-hydration').forEach(onPerfEntry)
    performance.getEntriesByName('beforeRender').forEach(onPerfEntry)
  }
  clearMarks()
}

function markRenderComplete() {
  if (!ST) return

  performance.mark('afterRender') // mark end of render
  const navStartEntries = performance.getEntriesByName('routeChange', 'mark')

  if (!navStartEntries.length) {
    return
  }

  performance.measure(
    'Next.js-route-change-to-render',
    navStartEntries[0].name,
    'beforeRender'
  )
  performance.measure('Next.js-render', 'beforeRender', 'afterRender')
  if (onPerfEntry) {
    performance.getEntriesByName('Next.js-render').forEach(onPerfEntry)
    performance
      .getEntriesByName('Next.js-route-change-to-render')
      .forEach(onPerfEntry)
  }
  clearMarks()
}

function clearMarks() {
  ;[
    'beforeRender',
    'afterHydrate',
    'afterRender',
    'routeChange',
  ].forEach(mark => performance.clearMarks(mark))
  ;[
    'Next.js-before-hydration',
    'Next.js-hydration',
    'Next.js-route-change-to-render',
    'Next.js-render',
  ].forEach(measure => performance.clearMeasures(measure))
}

function AppContainer({ children }) {
  return (
    <Container
      fn={error =>
        renderError({ App, err: error }).catch(err =>
          console.error('Error rendering page: ', err)
        )
      }
    >
      <RouterContext.Provider value={makePublicRouterInstance(router)}>
        <HeadManagerContext.Provider value={headManager.updateHead}>
          {children}
        </HeadManagerContext.Provider>
      </RouterContext.Provider>
    </Container>
  )
}

const wrapApp = App => props => {
  const appProps = { ...props, Component, err, router }
  return (
    <AppContainer>
      <App {...appProps} />
    </AppContainer>
  )
}

async function doRender({ App, Component, props, err }) {
  // Usual getInitialProps fetching is handled in next/router
  // this is for when ErrorComponent gets replaced by Component by HMR
  if (
    !props &&
    Component &&
    Component !== ErrorComponent &&
    lastAppProps.Component === ErrorComponent
  ) {
    const { pathname, query, asPath } = router
    const AppTree = wrapApp(App)
    const appCtx = {
      router,
      AppTree,
      Component: ErrorComponent,
      ctx: { err, pathname, query, asPath, AppTree },
    }
    props = await loadGetInitialProps(App, appCtx)
  }

  Component = Component || lastAppProps.Component
  props = props || lastAppProps.props

  const appProps = { ...props, Component, err, router }
  // lastAppProps has to be set before ReactDom.render to account for ReactDom throwing an error.
  lastAppProps = appProps

  emitter.emit('before-reactdom-render', {
    Component,
    ErrorComponent,
    appProps,
  })

  const elem = (
    <AppContainer>
      <App {...appProps} />
    </AppContainer>
  )

  // We catch runtime errors using componentDidCatch which will trigger renderError
  renderReactElement(
    process.env.__NEXT_STRICT_MODE ? (
      <React.StrictMode>{elem}</React.StrictMode>
    ) : (
      elem
    ),
    appElement
  )

  emitter.emit('after-reactdom-render', { Component, ErrorComponent, appProps })
}
