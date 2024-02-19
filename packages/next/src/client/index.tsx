/* global location */
import '../build/polyfills/polyfill-module'

import type Router from '../shared/lib/router/router'
import type {
  AppComponent,
  AppProps,
  PrivateRouteInfo,
} from '../shared/lib/router/router'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { HeadManagerContext } from '../shared/lib/head-manager-context.shared-runtime'
import mitt from '../shared/lib/mitt'
import type { MittEmitter } from '../shared/lib/mitt'
import { RouterContext } from '../shared/lib/router-context.shared-runtime'
import { handleSmoothScroll } from '../shared/lib/router/utils/handle-smooth-scroll'
import { isDynamicRoute } from '../shared/lib/router/utils/is-dynamic'
import {
  urlQueryToSearchParams,
  assign,
} from '../shared/lib/router/utils/querystring'
import { setConfig } from '../shared/lib/runtime-config.external'
import { getURL, loadGetInitialProps, ST } from '../shared/lib/utils'
import type { NextWebVitalsMetric, NEXT_DATA } from '../shared/lib/utils'
import { Portal } from './portal'
import initHeadManager from './head-manager'
import PageLoader from './page-loader'
import type { StyleSheetTuple } from './page-loader'
import measureWebVitals from './performance-relayer' // TODO: remove in the next major version
import { RouteAnnouncer } from './route-announcer'
import { createRouter, makePublicRouterInstance } from './router'
import { getProperError } from '../lib/is-error'
import { ImageConfigContext } from '../shared/lib/image-config-context.shared-runtime'
import type { ImageConfigComplete } from '../shared/lib/image-config'
import { removeBasePath } from './remove-base-path'
import { hasBasePath } from './has-base-path'
import { AppRouterContext } from '../shared/lib/app-router-context.shared-runtime'
import {
  adaptForAppRouterInstance,
  adaptForPathParams,
  adaptForSearchParams,
  PathnameContextProviderAdapter,
} from '../shared/lib/router/adapters'
import {
  SearchParamsContext,
  PathParamsContext,
} from '../shared/lib/hooks-client-context.shared-runtime'
import onRecoverableError from './on-recoverable-error'
import tracer from './tracing/tracer'
import reportToSocket from './tracing/report-to-socket'

/// <reference types="react-dom/experimental" />

declare global {
  interface Window {
    /* test fns */
    __NEXT_HYDRATED?: boolean
    __NEXT_HYDRATED_CB?: () => void

    /* prod */
    __NEXT_DATA__: NEXT_DATA
    __NEXT_P: any[]
  }
}
type RenderRouteInfo = PrivateRouteInfo & {
  App: AppComponent
  scroll?: { x: number; y: number } | null
  isHydratePass?: boolean
}
type RenderErrorProps = Omit<RenderRouteInfo, 'Component' | 'styleSheets'>
type RegisterFn = (input: [string, () => void]) => void

export const version = process.env.__NEXT_VERSION
export let router: Router
export const emitter: MittEmitter<string> = mitt()

const looseToArray = <T extends {}>(input: any): T[] => [].slice.call(input)

let initialData: NEXT_DATA
let defaultLocale: string | undefined = undefined
let asPath: string
let pageLoader: PageLoader
let appElement: HTMLElement | null
let headManager: {
  mountedInstances: Set<unknown>
  updateHead: (head: JSX.Element[]) => void
  getIsSsr?: () => boolean
}
let initialMatchesMiddleware = false
let lastAppProps: AppProps

let lastRenderReject: (() => void) | null
let devClient: any

let CachedApp: AppComponent, onPerfEntry: (metric: any) => void
let CachedComponent: React.ComponentType

class Container extends React.Component<{
  children?: React.ReactNode
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
    // - if middleware matches the current page (may have rewrite params)
    // - if rewrites in next.config.js match (may have rewrite params)
    if (
      router.isSsr &&
      (initialData.isFallback ||
        (initialData.nextExport &&
          (isDynamicRoute(router.pathname) ||
            location.search ||
            process.env.__NEXT_HAS_REWRITES ||
            initialMatchesMiddleware)) ||
        (initialData.props &&
          initialData.props.__N_SSG &&
          (location.search ||
            process.env.__NEXT_HAS_REWRITES ||
            initialMatchesMiddleware)))
    ) {
      // update query on mount for exported pages
      router
        .replace(
          router.pathname +
            '?' +
            String(
              assign(
                urlQueryToSearchParams(router.query),
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
            shallow: !initialData.isFallback && !initialMatchesMiddleware,
          }
        )
        .catch((err) => {
          if (!err.cancelled) throw err
        })
    }
  }

  componentDidUpdate() {
    this.scrollToHash()
  }

  scrollToHash() {
    let { hash } = location
    hash = hash && hash.substring(1)
    if (!hash) return

    const el: HTMLElement | null = document.getElementById(hash)
    if (!el) return

    // If we call scrollIntoView() in here without a setTimeout
    // it won't scroll properly.
    setTimeout(() => el.scrollIntoView(), 0)
  }

  render() {
    if (process.env.NODE_ENV === 'production') {
      return this.props.children
    } else {
      const ReactDevOverlay: typeof import('./components/react-dev-overlay/pages/client').ReactDevOverlay =
        require('./components/react-dev-overlay/pages/client').ReactDevOverlay
      return <ReactDevOverlay>{this.props.children}</ReactDevOverlay>
    }
  }
}

export async function initialize(opts: { devClient?: any } = {}): Promise<{
  assetPrefix: string
}> {
  tracer.onSpanEnd(reportToSocket)

  // This makes sure this specific lines are removed in production
  if (process.env.NODE_ENV === 'development') {
    devClient = opts.devClient
  }

  initialData = JSON.parse(
    document.getElementById('__NEXT_DATA__')!.textContent!
  )
  window.__NEXT_DATA__ = initialData

  defaultLocale = initialData.defaultLocale
  const prefix: string = initialData.assetPrefix || ''
  // With dynamic assetPrefix it's no longer possible to set assetPrefix at the build time
  // So, this is how we do it in the client side at runtime
  ;(self as any).__next_set_public_path__(`${prefix}/_next/`) //eslint-disable-line

  // Initialize next/config with the environment configuration
  setConfig({
    serverRuntimeConfig: {},
    publicRuntimeConfig: initialData.runtimeConfig || {},
  })

  asPath = getURL()

  // make sure not to attempt stripping basePath for 404s
  if (hasBasePath(asPath)) {
    asPath = removeBasePath(asPath)
  }

  if (process.env.__NEXT_I18N_SUPPORT) {
    const { normalizeLocalePath } =
      require('../shared/lib/i18n/normalize-locale-path') as typeof import('../shared/lib/i18n/normalize-locale-path')

    const { detectDomainLocale } =
      require('../shared/lib/i18n/detect-domain-locale') as typeof import('../shared/lib/i18n/detect-domain-locale')

    const { parseRelativeUrl } =
      require('../shared/lib/router/utils/parse-relative-url') as typeof import('../shared/lib/router/utils/parse-relative-url')

    const { formatUrl } =
      require('../shared/lib/router/utils/format-url') as typeof import('../shared/lib/router/utils/format-url')

    if (initialData.locales) {
      const parsedAs = parseRelativeUrl(asPath)
      const localePathResult = normalizeLocalePath(
        parsedAs.pathname,
        initialData.locales
      )

      if (localePathResult.detectedLocale) {
        parsedAs.pathname = localePathResult.pathname
        asPath = formatUrl(parsedAs)
      } else {
        // derive the default locale if it wasn't detected in the asPath
        // since we don't prerender static pages with all possible default
        // locales
        defaultLocale = initialData.locale
      }

      // attempt detecting default locale based on hostname
      const detectedDomain = detectDomainLocale(
        process.env.__NEXT_I18N_DOMAINS as any,
        window.location.hostname
      )

      // TODO: investigate if defaultLocale needs to be populated after
      // hydration to prevent mismatched renders
      if (detectedDomain) {
        defaultLocale = detectedDomain.defaultLocale
      }
    }
  }

  if (initialData.scriptLoader) {
    const { initScriptLoader } = require('./script')
    initScriptLoader(initialData.scriptLoader)
  }

  pageLoader = new PageLoader(initialData.buildId, prefix)

  const register: RegisterFn = ([r, f]) =>
    pageLoader.routeLoader.onEntrypoint(r, f)
  if (window.__NEXT_P) {
    // Defer page registration for another tick. This will increase the overall
    // latency in hydrating the page, but reduce the total blocking time.
    window.__NEXT_P.map((p) => setTimeout(() => register(p), 0))
  }
  window.__NEXT_P = []
  ;(window.__NEXT_P as any).push = register

  headManager = initHeadManager()
  headManager.getIsSsr = () => {
    return router.isSsr
  }

  appElement = document.getElementById('__next')
  return { assetPrefix: prefix }
}

function renderApp(App: AppComponent, appProps: AppProps) {
  return <App {...appProps} />
}

function AppContainer({
  children,
}: React.PropsWithChildren<{}>): React.ReactElement {
  // Create a memoized value for next/navigation router context.
  const adaptedForAppRouter = React.useMemo(() => {
    return adaptForAppRouterInstance(router)
  }, [])
  return (
    <Container
      fn={(error) =>
        // TODO: Fix disabled eslint rule
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        renderError({ App: CachedApp, err: error }).catch((err) =>
          console.error('Error rendering page: ', err)
        )
      }
    >
      <AppRouterContext.Provider value={adaptedForAppRouter}>
        <SearchParamsContext.Provider value={adaptForSearchParams(router)}>
          <PathnameContextProviderAdapter
            router={router}
            isAutoExport={self.__NEXT_DATA__.autoExport ?? false}
          >
            <PathParamsContext.Provider value={adaptForPathParams(router)}>
              <RouterContext.Provider value={makePublicRouterInstance(router)}>
                <HeadManagerContext.Provider value={headManager}>
                  <ImageConfigContext.Provider
                    value={
                      process.env
                        .__NEXT_IMAGE_OPTS as any as ImageConfigComplete
                    }
                  >
                    {children}
                  </ImageConfigContext.Provider>
                </HeadManagerContext.Provider>
              </RouterContext.Provider>
            </PathParamsContext.Provider>
          </PathnameContextProviderAdapter>
        </SearchParamsContext.Provider>
      </AppRouterContext.Provider>
    </Container>
  )
}

const wrapApp =
  (App: AppComponent) =>
  (wrappedAppProps: Record<string, any>): JSX.Element => {
    const appProps: AppProps = {
      ...wrappedAppProps,
      Component: CachedComponent,
      err: initialData.err,
      router,
    }
    return <AppContainer>{renderApp(App, appProps)}</AppContainer>
  }

// This method handles all runtime and debug errors.
// 404 and 500 errors are special kind of errors
// and they are still handle via the main render method.
function renderError(renderErrorProps: RenderErrorProps): Promise<any> {
  let { App, err } = renderErrorProps

  // In development runtime errors are caught by our overlay
  // In production we catch runtime errors using componentDidCatch which will trigger renderError
  if (process.env.NODE_ENV !== 'production') {
    // A Next.js rendering runtime error is always unrecoverable
    // FIXME: let's make this recoverable (error in GIP client-transition)
    devClient.onUnrecoverableError()

    // We need to render an empty <App> so that the `<ReactDevOverlay>` can
    // render itself.
    // TODO: Fix disabled eslint rule
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return doRender({
      App: () => null,
      props: {},
      Component: () => null,
      styleSheets: [],
    })
  }

  // Make sure we log the error to the console, otherwise users can't track down issues.
  console.error(err)
  console.error(
    `A client-side exception has occurred, see here for more info: https://nextjs.org/docs/messages/client-side-exception-occurred`
  )

  return pageLoader
    .loadPage('/_error')
    .then(({ page: ErrorComponent, styleSheets }) => {
      return lastAppProps?.Component === ErrorComponent
        ? import('../pages/_error')
            .then((errorModule) => {
              return import('../pages/_app').then((appModule) => {
                App = appModule.default as any as AppComponent
                renderErrorProps.App = App
                return errorModule
              })
            })
            .then((m) => ({
              ErrorComponent: m.default as React.ComponentType<{}>,
              styleSheets: [],
            }))
        : { ErrorComponent, styleSheets }
    })
    .then(({ ErrorComponent, styleSheets }) => {
      // In production we do a normal render with the `ErrorComponent` as component.
      // If we've gotten here upon initial render, we can use the props from the server.
      // Otherwise, we need to call `getInitialProps` on `App` before mounting.
      const AppTree = wrapApp(App)
      const appCtx = {
        Component: ErrorComponent,
        AppTree,
        router,
        ctx: {
          err,
          pathname: initialData.page,
          query: initialData.query,
          asPath,
          AppTree,
        },
      }
      return Promise.resolve(
        renderErrorProps.props?.err
          ? renderErrorProps.props
          : loadGetInitialProps(App, appCtx)
      ).then((initProps) =>
        // TODO: Fix disabled eslint rule
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
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

// Dummy component that we render as a child of Root so that we can
// toggle the correct styles before the page is rendered.
function Head({ callback }: { callback: () => void }): null {
  // We use `useLayoutEffect` to guarantee the callback is executed
  // as soon as React flushes the update.
  React.useLayoutEffect(() => callback(), [callback])
  return null
}

const performanceMarks = {
  navigationStart: 'navigationStart',
  beforeRender: 'beforeRender',
  afterRender: 'afterRender',
  afterHydrate: 'afterHydrate',
  routeChange: 'routeChange',
} as const

const performanceMeasures = {
  hydration: 'Next.js-hydration',
  beforeHydration: 'Next.js-before-hydration',
  routeChangeToRender: 'Next.js-route-change-to-render',
  render: 'Next.js-render',
} as const

let reactRoot: any = null
// On initial render a hydrate should always happen
let shouldHydrate: boolean = true

function clearMarks(): void {
  ;[
    performanceMarks.beforeRender,
    performanceMarks.afterHydrate,
    performanceMarks.afterRender,
    performanceMarks.routeChange,
  ].forEach((mark) => performance.clearMarks(mark))
}

function markHydrateComplete(): void {
  if (!ST) return

  performance.mark(performanceMarks.afterHydrate) // mark end of hydration

  const hasBeforeRenderMark = performance.getEntriesByName(
    performanceMarks.beforeRender,
    'mark'
  ).length
  if (hasBeforeRenderMark) {
    const beforeHydrationMeasure = performance.measure(
      performanceMeasures.beforeHydration,
      performanceMarks.navigationStart,
      performanceMarks.beforeRender
    )

    const hydrationMeasure = performance.measure(
      performanceMeasures.hydration,
      performanceMarks.beforeRender,
      performanceMarks.afterHydrate
    )

    if (
      process.env.NODE_ENV === 'development' &&
      // Old versions of Safari don't return `PerformanceMeasure`s from `performance.measure()`
      beforeHydrationMeasure !== undefined &&
      hydrationMeasure !== undefined
    ) {
      tracer
        .startSpan('navigation-to-hydration', {
          startTime: performance.timeOrigin + beforeHydrationMeasure.startTime,
          attributes: {
            pathname: location.pathname,
            query: location.search,
          },
        })
        .end(
          performance.timeOrigin +
            hydrationMeasure.startTime +
            hydrationMeasure.duration
        )
    }
  }

  if (onPerfEntry) {
    performance
      .getEntriesByName(performanceMeasures.hydration)
      .forEach(onPerfEntry)
  }
  clearMarks()
}

function markRenderComplete(): void {
  if (!ST) return

  performance.mark(performanceMarks.afterRender) // mark end of render
  const navStartEntries: PerformanceEntryList = performance.getEntriesByName(
    performanceMarks.routeChange,
    'mark'
  )

  if (!navStartEntries.length) return

  const hasBeforeRenderMark = performance.getEntriesByName(
    performanceMarks.beforeRender,
    'mark'
  ).length

  if (hasBeforeRenderMark) {
    performance.measure(
      performanceMeasures.routeChangeToRender,
      navStartEntries[0].name,
      performanceMarks.beforeRender
    )
    performance.measure(
      performanceMeasures.render,
      performanceMarks.beforeRender,
      performanceMarks.afterRender
    )
    if (onPerfEntry) {
      performance
        .getEntriesByName(performanceMeasures.render)
        .forEach(onPerfEntry)
      performance
        .getEntriesByName(performanceMeasures.routeChangeToRender)
        .forEach(onPerfEntry)
    }
  }

  clearMarks()
  ;[
    performanceMeasures.routeChangeToRender,
    performanceMeasures.render,
  ].forEach((measure) => performance.clearMeasures(measure))
}

function renderReactElement(
  domEl: HTMLElement,
  fn: (cb: () => void) => JSX.Element
): void {
  // mark start of hydrate/render
  if (ST) {
    performance.mark(performanceMarks.beforeRender)
  }

  const reactEl = fn(shouldHydrate ? markHydrateComplete : markRenderComplete)
  if (!reactRoot) {
    // Unlike with createRoot, you don't need a separate root.render() call here
    reactRoot = ReactDOM.hydrateRoot(domEl, reactEl, {
      onRecoverableError,
    })
    // TODO: Remove shouldHydrate variable when React 18 is stable as it can depend on `reactRoot` existing
    shouldHydrate = false
  } else {
    const startTransition = (React as any).startTransition
    startTransition(() => {
      reactRoot.render(reactEl)
    })
  }
}

function Root({
  callbacks,
  children,
}: React.PropsWithChildren<{
  callbacks: Array<() => void>
}>): React.ReactElement {
  // We use `useLayoutEffect` to guarantee the callbacks are executed
  // as soon as React flushes the update
  React.useLayoutEffect(
    () => callbacks.forEach((callback) => callback()),
    [callbacks]
  )
  // TODO: remove in the next major version
  // We should ask to measure the Web Vitals after rendering completes so we
  // don't cause any hydration delay:
  React.useEffect(() => {
    measureWebVitals(onPerfEntry)
  }, [])

  if (process.env.__NEXT_TEST_MODE) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      window.__NEXT_HYDRATED = true

      if (window.__NEXT_HYDRATED_CB) {
        window.__NEXT_HYDRATED_CB()
      }
    }, [])
  }

  return children as React.ReactElement
}

function doRender(input: RenderRouteInfo): Promise<any> {
  let { App, Component, props, err }: RenderRouteInfo = input
  let styleSheets: StyleSheetTuple[] | undefined =
    'initial' in input ? undefined : input.styleSheets
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

  let canceled: boolean = false
  let resolvePromise: () => void
  const renderPromise = new Promise<void>((resolve, reject) => {
    if (lastRenderReject) {
      lastRenderReject()
    }
    resolvePromise = () => {
      lastRenderReject = null
      resolve()
    }
    lastRenderReject = () => {
      canceled = true
      lastRenderReject = null

      const error: any = new Error('Cancel rendering route')
      error.cancelled = true
      reject(error)
    }
  })

  // This function has a return type to ensure it doesn't start returning a
  // Promise. It should remain synchronous.
  function onStart(): boolean {
    if (
      !styleSheets ||
      // We use `style-loader` in development, so we don't need to do anything
      // unless we're in production:
      process.env.NODE_ENV !== 'production'
    ) {
      return false
    }

    const currentStyleTags: HTMLStyleElement[] = looseToArray<HTMLStyleElement>(
      document.querySelectorAll('style[data-n-href]')
    )
    const currentHrefs: Set<string | null> = new Set(
      currentStyleTags.map((tag) => tag.getAttribute('data-n-href'))
    )

    const noscript: Element | null = document.querySelector(
      'noscript[data-n-css]'
    )
    const nonce: string | null | undefined =
      noscript?.getAttribute('data-n-css')

    styleSheets.forEach(({ href, text }: { href: string; text: any }) => {
      if (!currentHrefs.has(href)) {
        const styleTag = document.createElement('style')
        styleTag.setAttribute('data-n-href', href)
        styleTag.setAttribute('media', 'x')

        if (nonce) {
          styleTag.setAttribute('nonce', nonce)
        }

        document.head.appendChild(styleTag)
        styleTag.appendChild(document.createTextNode(text))
      }
    })
    return true
  }

  function onHeadCommit(): void {
    if (
      // We use `style-loader` in development, so we don't need to do anything
      // unless we're in production:
      process.env.NODE_ENV === 'production' &&
      // We can skip this during hydration. Running it wont cause any harm, but
      // we may as well save the CPU cycles:
      styleSheets &&
      // Ensure this render was not canceled
      !canceled
    ) {
      const desiredHrefs: Set<string> = new Set(styleSheets.map((s) => s.href))
      const currentStyleTags: HTMLStyleElement[] =
        looseToArray<HTMLStyleElement>(
          document.querySelectorAll('style[data-n-href]')
        )
      const currentHrefs: string[] = currentStyleTags.map(
        (tag) => tag.getAttribute('data-n-href')!
      )

      // Toggle `<style>` tags on or off depending on if they're needed:
      for (let idx = 0; idx < currentHrefs.length; ++idx) {
        if (desiredHrefs.has(currentHrefs[idx])) {
          currentStyleTags[idx].removeAttribute('media')
        } else {
          currentStyleTags[idx].setAttribute('media', 'x')
        }
      }

      // Reorder styles into intended order:
      let referenceNode: Element | null = document.querySelector(
        'noscript[data-n-css]'
      )
      if (
        // This should be an invariant:
        referenceNode
      ) {
        styleSheets.forEach(({ href }: { href: string }) => {
          const targetTag: Element | null = document.querySelector(
            `style[data-n-href="${href}"]`
          )
          if (
            // This should be an invariant:
            targetTag
          ) {
            referenceNode!.parentNode!.insertBefore(
              targetTag,
              referenceNode!.nextSibling
            )
            referenceNode = targetTag
          }
        })
      }

      // Finally, clean up server rendered stylesheets:
      looseToArray<HTMLLinkElement>(
        document.querySelectorAll('link[data-n-p]')
      ).forEach((el) => {
        el.parentNode!.removeChild(el)
      })
    }

    if (input.scroll) {
      const { x, y } = input.scroll
      handleSmoothScroll(() => {
        window.scrollTo(x, y)
      })
    }
  }

  function onRootCommit(): void {
    resolvePromise()
  }

  onStart()

  const elem: JSX.Element = (
    <>
      <Head callback={onHeadCommit} />
      <AppContainer>
        {renderApp(App, appProps)}
        <Portal type="next-route-announcer">
          <RouteAnnouncer />
        </Portal>
      </AppContainer>
    </>
  )

  // We catch runtime errors using componentDidCatch which will trigger renderError
  renderReactElement(appElement!, (callback) => (
    <Root callbacks={[callback, onRootCommit]}>
      {process.env.__NEXT_STRICT_MODE ? (
        <React.StrictMode>{elem}</React.StrictMode>
      ) : (
        elem
      )}
    </Root>
  ))

  return renderPromise
}

async function render(renderingProps: RenderRouteInfo): Promise<void> {
  // if an error occurs in a server-side page (e.g. in getInitialProps),
  // skip re-rendering the error page client-side as data-fetching operations
  // will already have been done on the server and NEXT_DATA contains the correct
  // data for straight-forward hydration of the error page
  if (
    renderingProps.err &&
    // renderingProps.Component might be undefined if there is a top/module-level error
    (typeof renderingProps.Component === 'undefined' ||
      !renderingProps.isHydratePass)
  ) {
    await renderError(renderingProps)
    return
  }

  try {
    await doRender(renderingProps)
  } catch (err) {
    const renderErr = getProperError(err)
    // bubble up cancelation errors
    if ((renderErr as Error & { cancelled?: boolean }).cancelled) {
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

export async function hydrate(opts?: { beforeRender?: () => Promise<void> }) {
  let initialErr = initialData.err

  try {
    const appEntrypoint = await pageLoader.routeLoader.whenEntrypoint('/_app')
    if ('error' in appEntrypoint) {
      throw appEntrypoint.error
    }

    const { component: app, exports: mod } = appEntrypoint
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
        attribution,
      }: any): void => {
        // Combines timestamp with random number for unique ID
        const uniqueID: string = `${Date.now()}-${
          Math.floor(Math.random() * (9e12 - 1)) + 1e12
        }`
        let perfStartEntry: string | undefined

        if (entries && entries.length) {
          perfStartEntry = entries[0].startTime
        }

        const webVitals: NextWebVitalsMetric = {
          id: id || uniqueID,
          name,
          startTime: startTime || perfStartEntry,
          value: value == null ? duration : value,
          label:
            entryType === 'mark' || entryType === 'measure'
              ? 'custom'
              : 'web-vital',
        }
        if (attribution) {
          webVitals.attribution = attribution
        }
        mod.reportWebVitals(webVitals)
      }
    }

    const pageEntrypoint =
      // The dev server fails to serve script assets when there's a hydration
      // error, so we need to skip waiting for the entrypoint.
      process.env.NODE_ENV === 'development' && initialData.err
        ? { error: initialData.err }
        : await pageLoader.routeLoader.whenEntrypoint(initialData.page)
    if ('error' in pageEntrypoint) {
      throw pageEntrypoint.error
    }
    CachedComponent = pageEntrypoint.component

    if (process.env.NODE_ENV !== 'production') {
      const { isValidElementType } = require('next/dist/compiled/react-is')
      if (!isValidElementType(CachedComponent)) {
        throw new Error(
          `The default export is not a React Component in page: "${initialData.page}"`
        )
      }
    }
  } catch (error) {
    // This catches errors like throwing in the top level of a module
    initialErr = getProperError(error)
  }

  if (process.env.NODE_ENV === 'development') {
    const getServerError: typeof import('./components/react-dev-overlay/pages/client').getServerError =
      require('./components/react-dev-overlay/pages/client').getServerError
    // Server-side runtime errors need to be re-thrown on the client-side so
    // that the overlay is rendered.
    if (initialErr) {
      if (initialErr === initialData.err) {
        setTimeout(() => {
          let error
          try {
            // Generate a new error object. We `throw` it because some browsers
            // will set the `stack` when thrown, and we want to ensure ours is
            // not overridden when we re-throw it below.
            throw new Error(initialErr!.message)
          } catch (e) {
            error = e as Error
          }

          error.name = initialErr!.name
          error.stack = initialErr!.stack
          throw getServerError(error, initialErr!.source!)
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
    await window.__NEXT_PRELOADREADY(initialData.dynamicIds)
  }

  router = createRouter(initialData.page, initialData.query, asPath, {
    initialProps: initialData.props,
    pageLoader,
    App: CachedApp,
    Component: CachedComponent,
    wrapApp,
    err: initialErr,
    isFallback: Boolean(initialData.isFallback),
    subscription: (info, App, scroll) =>
      render(
        Object.assign<
          {},
          Omit<RenderRouteInfo, 'App' | 'scroll'>,
          Pick<RenderRouteInfo, 'App' | 'scroll'>
        >({}, info, {
          App,
          scroll,
        }) as RenderRouteInfo
      ),
    locale: initialData.locale,
    locales: initialData.locales,
    defaultLocale,
    domainLocales: initialData.domainLocales,
    isPreview: initialData.isPreview,
  })

  initialMatchesMiddleware = await router._initialMatchesMiddlewarePromise

  const renderCtx: RenderRouteInfo = {
    App: CachedApp,
    initial: true,
    Component: CachedComponent,
    props: initialData.props,
    err: initialErr,
    isHydratePass: true,
  }

  if (opts?.beforeRender) {
    await opts.beforeRender()
  }

  render(renderCtx)
}
