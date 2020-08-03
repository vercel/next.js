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
import { hasBasePath, delBasePath } from '../next-server/lib/router/router'
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
  props: hydrateProps,
  err: hydrateErr,
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

let asPath = getURL()

// make sure not to attempt stripping basePath for 404s
if (hasBasePath(asPath)) {
  asPath = delBasePath(asPath)
}

const pageLoader = new PageLoader(buildId, prefix, page)
const register = ([r, f]) => pageLoader.registerPage(r, f)
if (window.__NEXT_P) {
  // Defer page registration for another tick. This will increase the overall
  // latency in hydrating the page, but reduce the total blocking time.
  window.__NEXT_P.map((p) => setTimeout(() => register(p), 0))
}
window.__NEXT_P = []
window.__NEXT_P.push = register

const headManager = initHeadManager()
const appElement = document.getElementById('__next')

let lastAppProps
let lastRenderReject
let webpackHMR
export let router
let CachedComponent
let CachedApp, onPerfEntry

class Container extends React.Component {
  componentDidCatch(componentErr, info) {
    this.props.fn(componentErr, info)
  }

  componentDidMount() {
    this.scrollToHash()

    // We need to replace the router state if:
    // - the page was (auto) exported and has a query string or search (hash)
    // - it was auto exported and is a dynamic route (to provide params)
    // - if it is a client-side skeleton (fallback render)
    if (
      router.isSsr &&
      (isFallback ||
        (data.nextExport &&
          (isDynamicRoute(router.pathname) || location.search)) ||
        (hydrateProps && hydrateProps.__N_SSG && location.search))
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
      const { ReactDevOverlay } = require('@next/react-dev-overlay/lib/client')
      return <ReactDevOverlay>{this.props.children}</ReactDevOverlay>
    }
  }
}

export const emitter = mitt()

export default async ({ webpackHMR: passedWebpackHMR } = {}) => {
  // This makes sure this specific lines are removed in production
  if (process.env.NODE_ENV === 'development') {
    webpackHMR = passedWebpackHMR
  }
  const { page: app, mod } = await pageLoader.loadPage('/_app')
  CachedApp = app

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
      const uniqueID = `${Date.now()}-${
        Math.floor(Math.random() * (9e12 - 1)) + 1e12
      }`
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

  let initialErr = hydrateErr

  try {
    ;({ page: CachedComponent } = await pageLoader.loadPage(page))

    if (process.env.NODE_ENV !== 'production') {
      const { isValidElementType } = require('react-is')
      if (!isValidElementType(CachedComponent)) {
        throw new Error(
          `The default export is not a React Component in page: "${page}"`
        )
      }
    }
  } catch (error) {
    // This catches errors like throwing in the top level of a module
    initialErr = error
  }

  if (process.env.NODE_ENV === 'development') {
    const { getNodeError } = require('@next/react-dev-overlay/lib/client')
    // Server-side runtime errors need to be re-thrown on the client-side so
    // that the overlay is rendered.
    if (initialErr) {
      if (initialErr === hydrateErr) {
        setTimeout(() => {
          let error
          try {
            // Generate a new error object. We `throw` it because some browsers
            // will set the `stack` when thrown, and we want to ensure ours is
            // not overridden when we re-throw it below.
            throw new Error(initialErr.message)
          } catch (e) {
            error = e
          }

          error.name = initialErr.name
          error.stack = initialErr.stack

          const node = getNodeError(error)
          throw node
        })
      }
      // We replaced the server-side error with a client-side error, and should
      // no longer rewrite the stack trace to a Node error.
      else {
        setTimeout(() => {
          throw initialErr
        })
      }
    }
  }

  if (window.__NEXT_PRELOADREADY) {
    await window.__NEXT_PRELOADREADY(dynamicIds)
  }

  router = createRouter(page, query, asPath, {
    initialProps: hydrateProps,
    pageLoader,
    App: CachedApp,
    Component: CachedComponent,
    wrapApp,
    err: initialErr,
    isFallback,
    subscription: ({ Component, props, err }, App) =>
      render({ App, Component, props, err }),
  })

  // call init-client middleware
  if (process.env.__NEXT_PLUGINS) {
    // eslint-disable-next-line
    import('next-plugin-loader?middleware=on-init-client!')
      .then((initClientModule) => {
        return initClientModule.default({ router })
      })
      .catch((initClientErr) => {
        console.error('Error calling client-init for plugins', initClientErr)
      })
  }

  const renderCtx = {
    App: CachedApp,
    Component: CachedComponent,
    props: hydrateProps,
    err: initialErr,
  }

  if (process.env.NODE_ENV === 'production') {
    render(renderCtx)
    return emitter
  }

  if (process.env.NODE_ENV !== 'production') {
    return { emitter, render, renderCtx }
  }
}

export async function render(renderingProps) {
  if (renderingProps.err) {
    await renderError(renderingProps)
    return
  }

  try {
    await doRender(renderingProps)
  } catch (renderErr) {
    if (process.env.NODE_ENV === 'development') {
      // Ensure this error is displayed in the overlay in development
      setTimeout(() => {
        throw renderErr
      })
    }
    await renderError({ ...renderingProps, err: renderErr })
  }
}

// This method handles all runtime and debug errors.
// 404 and 500 errors are special kind of errors
// and they are still handle via the main render method.
export function renderError(renderErrorProps) {
  const { App, err } = renderErrorProps

  // In development runtime errors are caught by our overlay
  // In production we catch runtime errors using componentDidCatch which will trigger renderError
  if (process.env.NODE_ENV !== 'production') {
    // A Next.js rendering runtime error is always unrecoverable
    // FIXME: let's make this recoverable (error in GIP client-transition)
    webpackHMR.onUnrecoverableError()

    // We need to render an empty <App> so that the `<ReactDevOverlay>` can
    // render itself.
    return doRender({
      App: () => null,
      props: {},
      Component: () => null,
      err: null,
    })
  }
  if (process.env.__NEXT_PLUGINS) {
    // eslint-disable-next-line
    import('next-plugin-loader?middleware=on-error-client!')
      .then((onClientErrorModule) => {
        return onClientErrorModule.default({ err })
      })
      .catch((onClientErrorErr) => {
        console.error(
          'error calling on-error-client for plugins',
          onClientErrorErr
        )
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
      renderErrorProps.props
        ? renderErrorProps.props
        : loadGetInitialProps(App, appCtx)
    ).then((initProps) =>
      doRender({
        ...renderErrorProps,
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
          ? ReactDOM.unstable_createRoot(domEl, opts)
          : ReactDOM.unstable_createBlockingRoot(domEl, opts)
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
  ;['Next.js-route-change-to-render', 'Next.js-render'].forEach((measure) =>
    performance.clearMeasures(measure)
  )
}

function clearMarks() {
  ;[
    'beforeRender',
    'afterHydrate',
    'afterRender',
    'routeChange',
  ].forEach((mark) => performance.clearMarks(mark))
}

function AppContainer({ children }) {
  return (
    <Container
      fn={(error) =>
        renderError({ App: CachedApp, err: error }).catch((err) =>
          console.error('Error rendering page: ', err)
        )
      }
    >
      <RouterContext.Provider value={makePublicRouterInstance(router)}>
        <HeadManagerContext.Provider value={headManager}>
          {children}
        </HeadManagerContext.Provider>
      </RouterContext.Provider>
    </Container>
  )
}

const wrapApp = (App) => (wrappedAppProps) => {
  const appProps = {
    ...wrappedAppProps,
    Component: CachedComponent,
    err: hydrateErr,
    router,
  }
  return (
    <AppContainer>
      <App {...appProps} />
    </AppContainer>
  )
}

async function doRender({ App, Component, props, err }) {
  Component = Component || lastAppProps.Component
  props = props || lastAppProps.props

  const appProps = { ...props, Component, err, router }
  // lastAppProps has to be set before ReactDom.render to account for ReactDom throwing an error.
  lastAppProps = appProps

  let resolvePromise
  const renderPromise = new Promise((resolve, reject) => {
    if (lastRenderReject) {
      lastRenderReject()
    }
    resolvePromise = () => {
      lastRenderReject = null
      resolve()
    }
    lastRenderReject = () => {
      lastRenderReject = null
      reject()
    }
  })

  const elem = (
    <Root callback={resolvePromise}>
      <AppContainer>
        <App {...appProps} />
      </AppContainer>
    </Root>
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

  await renderPromise
}

function Root({ callback, children }) {
  // We use `useLayoutEffect` to guarantee the callback is executed
  // as soon as React flushes the update.
  React.useLayoutEffect(() => callback(), [callback])
  return children
}
