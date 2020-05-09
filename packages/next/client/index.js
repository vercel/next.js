/* global location */
import { createRouter, makePublicRouterInstance } from 'next/router'
import { parse as parseQs, stringify as stringifyQs } from 'querystring'
import React from 'react'
import ReactDOM from 'react-dom'
import { HeadManagerContext } from '../next-server/lib/head-manager-context'
import mitt from '../next-server/lib/mitt'
import { RouterContext } from '../next-server/lib/router-context'
import { isDynamicRoute } from '../next-server/lib/router/utils/is-dynamic'
import * as envConfig from '../next-server/lib/runtime-config'
import { getURL, loadGetInitialProps, ST } from '../next-server/lib/utils'
import initHeadManager from './head-manager'
import PageLoader from './page-loader'
import measureWebVitals from './performance-relayer'

/// <reference types="react-dom/experimental" />

if (!('finally' in Promise.prototype)) {
  // eslint-disable-next-line no-extend-native
  Promise.prototype.finally = require('next/dist/build/polyfills/finally-polyfill.min')
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
  isFallback,
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

const updateHead = initHeadManager()
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

    // We need to replace the router state if:
    // - the page was (auto) exported and has a query string or search (hash)
    // - it was auto exported and is a dynamic route (to provide params)
    // - if it is a client-side skeleton (fallback render)
    if (
      router.isSsr &&
      (isFallback ||
        (data.nextExport &&
          (isDynamicRoute(router.pathname) || location.search)) ||
        (props.__N_SSG && location.search))
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
          // Fallback pages must trigger the data fetch, so the transition is
          // not shallow.
          // Other pages (strictly updating query) happens shallowly, as data
          // requirements would already be present.
          shallow: !isFallback,
        }
      )
    }

    if (process.env.__NEXT_TEST_MODE) {
      window.__NEXT_HYDRATED = true

      if (window.__NEXT_HYDRATED_CB) {
        window.__NEXT_HYDRATED_CB()
      }
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
    if (process.env.NODE_ENV === 'production') {
      return this.props.children
    }
    if (process.env.NODE_ENV !== 'production') {
      if (process.env.__NEXT_FAST_REFRESH) {
        const {
          ReactDevOverlay,
        } = require('@next/react-dev-overlay/lib/client')
        return <ReactDevOverlay>{this.props.children}</ReactDevOverlay>
      }
      return this.props.children
    }
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

  if (mod && mod.reportWebVitals) {
    onPerfEntry = ({
      id,
      name,
      startTime,
      value,
      duration,
      entryType,
      entries,
    }) => {
      // Combines timestamp with random number for unique ID
      const uniqueID = `${Date.now()}-${Math.floor(Math.random() * (9e12 - 1)) +
        1e12}`
      let perfStartEntry

      if (entries && entries.length) {
        perfStartEntry = entries[0].startTime
      }

      mod.reportWebVitals({
        id: id || uniqueID,
        name,
        startTime: startTime || perfStartEntry,
        value: value == null ? duration : value,
        label:
          entryType === 'mark' || entryType === 'measure'
            ? 'custom'
            : 'web-vital',
      })
    }
  }

  let initialErr = err

  try {
    ;({ page: Component } = await pageLoader.loadPage(page))

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
    isFallback,
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

  if (process.env.NODE_ENV === 'production') {
    render(renderCtx)
    return emitter
  }

  if (process.env.NODE_ENV !== 'production') {
    return { emitter, render, renderCtx }
  }
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
export function renderError(props) {
  const { App, err } = props

  // In development runtime errors are caught by react-error-overlay
  // In production we catch runtime errors using componentDidCatch which will trigger renderError
  if (process.env.NODE_ENV !== 'production') {
    if (process.env.__NEXT_FAST_REFRESH) {
      const { getNodeError } = require('@next/react-dev-overlay/lib/client')
      // Server-side runtime errors need to be re-thrown on the client-side so
      // that the overlay is rendered.
      if (isInitialRender) {
        setTimeout(() => {
          let error
          try {
            // Generate a new error object. We `throw` it because some browsers
            // will set the `stack` when thrown, and we want to ensure ours is
            // not overridden when we re-throw it below.
            throw new Error(err.message)
          } catch (e) {
            error = e
          }

          error.name = err.name
          error.stack = err.stack

          const node = getNodeError(error)
          throw node
        })
      }

      // We need to render an empty <App> so that the `<ReactDevOverlay>` can
      // render itself.
      return doRender({
        App: () => null,
        props: {},
        Component: () => null,
        err: null,
      })
    }

    // Legacy behavior:
    return Promise.resolve(
      webpackHMR.reportRuntimeError(webpackHMR.prepareError(err))
    )
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
  return pageLoader.loadPage('/_error').then(({ page: ErrorComponent }) => {
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
    return Promise.resolve(
      props.props ? props.props : loadGetInitialProps(App, appCtx)
    ).then(initProps =>
      doRender({
        ...props,
        err,
        Component: ErrorComponent,
        props: initProps,
      })
    )
  })
}

// If hydrate does not exist, eg in preact.
let isInitialRender = typeof ReactDOM.hydrate === 'function'
let reactRoot = null
function renderReactElement(reactEl, domEl) {
  if (process.env.__NEXT_REACT_MODE !== 'legacy') {
    if (!reactRoot) {
      const opts = { hydrate: true }
      reactRoot =
        process.env.__NEXT_REACT_MODE === 'concurrent'
          ? ReactDOM.createRoot(domEl, opts)
          : ReactDOM.createBlockingRoot(domEl, opts)
    }
    reactRoot.render(reactEl)
  } else {
    // mark start of hydrate/render
    if (ST) {
      performance.mark('beforeRender')
    }

    // The check for `.hydrate` is there to support React alternatives like preact
    if (isInitialRender) {
      ReactDOM.hydrate(reactEl, domEl, markHydrateComplete)
      isInitialRender = false

      if (onPerfEntry && ST) {
        measureWebVitals(onPerfEntry)
      }
    } else {
      ReactDOM.render(reactEl, domEl, markRenderComplete)
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
  ;['Next.js-route-change-to-render', 'Next.js-render'].forEach(measure =>
    performance.clearMeasures(measure)
  )
}

function clearMarks() {
  ;[
    'beforeRender',
    'afterHydrate',
    'afterRender',
    'routeChange',
  ].forEach(mark => performance.clearMarks(mark))
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
        <HeadManagerContext.Provider value={updateHead}>
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
