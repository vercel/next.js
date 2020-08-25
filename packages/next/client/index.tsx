/* global location */
import React from 'react'
import ReactDOM from 'react-dom'
import { HeadManagerContext } from '../next-server/lib/head-manager-context'
import mitt from '../next-server/lib/mitt'
import { RouterContext } from '../next-server/lib/router-context'
import { delBasePath, hasBasePath } from '../next-server/lib/router/router'
import type Router from '../next-server/lib/router/router'
import type {
  AppComponent,
  AppProps,
  PrivateRouteInfo,
} from '../next-server/lib/router/router'
import { isDynamicRoute } from '../next-server/lib/router/utils/is-dynamic'
import * as querystring from '../next-server/lib/router/utils/querystring'
import * as envConfig from '../next-server/lib/runtime-config'
import { getURL, loadGetInitialProps, ST } from '../next-server/lib/utils'
import type { NEXT_DATA } from '../next-server/lib/utils'
import initHeadManager from './head-manager'
import PageLoader, { createLink } from './page-loader'
import measureWebVitals from './performance-relayer'
import { createRouter, makePublicRouterInstance } from './router'

/// <reference types="react-dom/experimental" />

declare let __webpack_public_path__: string

declare global {
  interface Window {
    /* test fns */
    __NEXT_HYDRATED?: boolean
    __NEXT_HYDRATED_CB?: () => void

    /* prod */
    __NEXT_PRELOADREADY?: (ids?: string[]) => void
    __NEXT_DATA__: NEXT_DATA
    __NEXT_P: any[]
  }
}

type RenderRouteInfo = PrivateRouteInfo & { App: AppComponent }
type RenderErrorProps = Omit<RenderRouteInfo, 'Component' | 'styleSheets'>

if (!('finally' in Promise.prototype)) {
  ;(Promise.prototype as PromiseConstructor['prototype']).finally = require('next/dist/build/polyfills/finally-polyfill.min')
}

const data: typeof window['__NEXT_DATA__'] = JSON.parse(
  document.getElementById('__NEXT_DATA__')!.textContent!
)
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

type RegisterFn = (input: [string, () => void]) => void

const pageLoader = new PageLoader(
  buildId,
  prefix,
  page,
  [].slice
    .call(document.querySelectorAll('link[rel=stylesheet][data-n-p]'))
    .map((e: HTMLLinkElement) => e.getAttribute('href')!)
)
const register: RegisterFn = ([r, f]) => pageLoader.registerPage(r, f)
if (window.__NEXT_P) {
  // Defer page registration for another tick. This will increase the overall
  // latency in hydrating the page, but reduce the total blocking time.
  window.__NEXT_P.map((p) => setTimeout(() => register(p), 0))
}
window.__NEXT_P = []
;(window.__NEXT_P as any).push = register

const headManager = initHeadManager()
const appElement = document.getElementById('__next')

let lastAppProps: AppProps
let lastRenderReject: (() => void) | null
let webpackHMR: any
export let router: Router
let CachedComponent: React.ComponentType
let cachedStyleSheets: string[]
let CachedApp: AppComponent, onPerfEntry: (metric: any) => void

class Container extends React.Component<{
  fn: (err: Error, info?: any) => void
}> {
  componentDidCatch(componentErr: Error, info: any) {
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
          String(
            querystring.assign(
              querystring.urlQueryToSearchParams(router.query),
              new URLSearchParams(location.search)
            )
          ),
        asPath,
        {
          // @ts-ignore
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
    } else {
      const { ReactDevOverlay } = require('@next/react-dev-overlay/lib/client')
      return <ReactDevOverlay>{this.props.children}</ReactDevOverlay>
    }
  }
}

export const emitter = mitt()

export default async (opts: { webpackHMR?: any } = {}) => {
  // This makes sure this specific lines are removed in production
  if (process.env.NODE_ENV === 'development') {
    webpackHMR = opts.webpackHMR
  }
  const { page: app, mod } = await pageLoader.loadPage('/_app')
  CachedApp = app as AppComponent

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
    ;({
      page: CachedComponent,
      styleSheets: cachedStyleSheets,
    } = await pageLoader.loadPage(page))

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
            throw new Error(initialErr!.message)
          } catch (e) {
            error = e
          }

          error.name = initialErr!.name
          error.stack = initialErr!.stack

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
    initialStyleSheets: cachedStyleSheets,
    wrapApp,
    err: initialErr,
    isFallback: Boolean(isFallback),
    subscription: ({ Component, styleSheets, props, err }, App) =>
      render({ App, Component, styleSheets, props, err }),
  })

  // call init-client middleware
  if (process.env.__NEXT_PLUGINS) {
    // @ts-ignore
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
    styleSheets: cachedStyleSheets,
    props: hydrateProps,
    err: initialErr,
  }

  if (process.env.NODE_ENV === 'production') {
    render(renderCtx)
    return emitter
  } else {
    return { emitter, render, renderCtx }
  }
}

export async function render(renderingProps: RenderRouteInfo) {
  if (renderingProps.err) {
    await renderError(renderingProps)
    return
  }

  try {
    await doRender(renderingProps)
  } catch (renderErr) {
    // bubble up cancelation errors
    if (renderErr.cancelled) {
      throw renderErr
    }

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
export function renderError(renderErrorProps: RenderErrorProps) {
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
      styleSheets: [],
    })
  }
  if (process.env.__NEXT_PLUGINS) {
    // @ts-ignore
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
  return pageLoader
    .loadPage('/_error')
    .then(({ page: ErrorComponent, styleSheets }) => {
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
          styleSheets,
          props: initProps,
        })
      )
    })
}

// If hydrate does not exist, eg in preact.
let isInitialRender = typeof ReactDOM.hydrate === 'function'
let reactRoot: any = null
function renderReactElement(reactEl: JSX.Element, domEl: HTMLElement) {
  if (process.env.__NEXT_REACT_MODE !== 'legacy') {
    if (!reactRoot) {
      const opts = { hydrate: true }
      reactRoot =
        process.env.__NEXT_REACT_MODE === 'concurrent'
          ? (ReactDOM as any).unstable_createRoot(domEl, opts)
          : (ReactDOM as any).unstable_createBlockingRoot(domEl, opts)
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

function AppContainer({
  children,
}: React.PropsWithChildren<{}>): React.ReactElement {
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

const wrapApp = (App: AppComponent) => (
  wrappedAppProps: Record<string, any>
) => {
  const appProps: AppProps = {
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

function doRender({
  App,
  Component,
  props,
  err,
  styleSheets,
}: RenderRouteInfo): Promise<any> {
  Component = Component || lastAppProps.Component
  props = props || lastAppProps.props

  const appProps: AppProps = {
    ...props,
    Component,
    err,
    router,
  }
  // lastAppProps has to be set before ReactDom.render to account for ReactDom throwing an error.
  lastAppProps = appProps

  let resolvePromise: () => void
  let renderPromiseReject: () => void
  const renderPromise = new Promise((resolve, reject) => {
    if (lastRenderReject) {
      lastRenderReject()
    }
    resolvePromise = () => {
      lastRenderReject = null
      resolve()
    }
    renderPromiseReject = lastRenderReject = () => {
      lastRenderReject = null

      const error: any = new Error('Cancel rendering route')
      error.cancelled = true
      reject(error)
    }
  })

  // TODO: consider replacing this with real `<style>` tags that have
  // plain-text CSS content that's provided by RouteInfo. That'd remove the
  // need for the staging `<link>`s and the ability for CSS to be missing at
  // this phase, allowing us to remove the error handling flow that reloads the
  // page.
  function onStart(): Promise<void[]> {
    if (
      // We can skip this during hydration. Running it wont cause any harm, but
      // we may as well save the CPU cycles.
      isInitialRender ||
      // We use `style-loader` in development, so we don't need to do anything
      // unless we're in production:
      process.env.NODE_ENV !== 'production'
    ) {
      return Promise.resolve([])
    }

    // Clean up previous render if canceling:
    ;([].slice.call(
      document.querySelectorAll(
        'link[data-n-staging], noscript[data-n-staging]'
      )
    ) as HTMLLinkElement[]).forEach((el) => {
      el.parentNode!.removeChild(el)
    })

    const referenceNodes: HTMLLinkElement[] = [].slice.call(
      document.querySelectorAll('link[data-n-g], link[data-n-p]')
    ) as HTMLLinkElement[]
    const referenceHrefs = new Set(
      referenceNodes.map((e) => e.getAttribute('href'))
    )
    let referenceNode: Element | undefined =
      referenceNodes[referenceNodes.length - 1]

    const required: (Promise<any> | true)[] = styleSheets.map((href) => {
      let newNode: Element, promise: Promise<any> | true
      const existingLink = referenceHrefs.has(href)
      if (existingLink) {
        newNode = document.createElement('noscript')
        newNode.setAttribute('data-n-staging', href)
        promise = true
      } else {
        const [link, onload] = createLink(href, 'stylesheet')
        link.setAttribute('data-n-staging', '')
        // Media `none` does not work in Firefox, so `print` is more
        // cross-browser. Since this is so short lived we don't have to worry
        // about style thrashing in a print view (where no routing is going to be
        // happening anyway).
        link.setAttribute('media', 'print')
        newNode = link
        promise = onload
      }

      if (referenceNode) {
        referenceNode.parentNode!.insertBefore(
          newNode,
          referenceNode.nextSibling
        )
        referenceNode = newNode
      } else {
        document.head.appendChild(newNode)
      }
      return promise
    })
    return Promise.all(required).catch(() => {
      // This is too late in the rendering lifecycle to use the existing
      // `PAGE_LOAD_ERROR` flow (via `handleRouteInfoError`).
      // To match that behavior, we request the page to reload with the current
      // asPath. This is already set at this phase since we "committed" to the
      // render.
      // This handles an edge case where a new deployment is rolled during
      // client-side transition and the CSS assets are missing.

      // This prevents:
      //   1. An unstyled page from being rendered (old behavior)
      //   2. The `/_error` page being rendered (we want to reload for the new
      //      deployment)
      window.location.href = router.asPath

      // Instead of rethrowing the CSS loading error, we give a promise that
      // won't resolve. This pauses the rendering process until the page
      // reloads. Re-throwing the error could result in a flash of error page.
      // throw cssLoadingError
      return new Promise(() => {})
    })
  }

  function onCommit() {
    if (
      // We use `style-loader` in development, so we don't need to do anything
      // unless we're in production:
      process.env.NODE_ENV === 'production' &&
      // We can skip this during hydration. Running it wont cause any harm, but
      // we may as well save the CPU cycles:
      !isInitialRender &&
      // Ensure this render commit owns the currently staged stylesheets:
      renderPromiseReject === lastRenderReject
    ) {
      // Remove or relocate old stylesheets:
      const relocatePlaceholders = [].slice.call(
        document.querySelectorAll('noscript[data-n-staging]')
      ) as HTMLElement[]
      const relocateHrefs = relocatePlaceholders.map((e) =>
        e.getAttribute('data-n-staging')
      )
      ;([].slice.call(
        document.querySelectorAll('link[data-n-p]')
      ) as HTMLLinkElement[]).forEach((el) => {
        const currentHref = el.getAttribute('href')
        const relocateIndex = relocateHrefs.indexOf(currentHref)
        if (relocateIndex !== -1) {
          const placeholderElement = relocatePlaceholders[relocateIndex]
          placeholderElement.parentNode?.replaceChild(el, placeholderElement)
        } else {
          el.parentNode!.removeChild(el)
        }
      })

      // Activate new stylesheets:
      ;[].slice
        .call(document.querySelectorAll('link[data-n-staging]'))
        .forEach((el: HTMLLinkElement) => {
          el.removeAttribute('data-n-staging')
          el.removeAttribute('media')
          el.setAttribute('data-n-p', '')
        })

      // Force browser to recompute layout, which prevents a flash of unstyled
      // content:
      getComputedStyle(document.body, 'height')
    }

    resolvePromise()
  }

  const elem = (
    <Root callback={onCommit}>
      <AppContainer>
        <App {...appProps} />
      </AppContainer>
    </Root>
  )

  // We catch runtime errors using componentDidCatch which will trigger renderError
  return Promise.race([
    // Download required CSS assets first:
    onStart()
      .then(() => {
        // Ensure a new render has not been started:
        if (renderPromiseReject === lastRenderReject) {
          // Queue rendering:
          renderReactElement(
            process.env.__NEXT_STRICT_MODE ? (
              <React.StrictMode>{elem}</React.StrictMode>
            ) : (
              elem
            ),
            appElement!
          )
        }
      })
      .then(
        () =>
          // Wait for rendering to complete:
          renderPromise
      ),

    // Bail early on route cancelation (rejection):
    renderPromise,
  ])
}

function Root({
  callback,
  children,
}: React.PropsWithChildren<{
  callback: () => void
}>): React.ReactElement {
  // We use `useLayoutEffect` to guarantee the callback is executed
  // as soon as React flushes the update.
  React.useLayoutEffect(() => callback(), [callback])
  return children as React.ReactElement
}
