/* global __NEXT_DATA__ */
// tslint:disable:no-console
import { ParsedUrlQuery } from 'querystring'
import { ComponentType } from 'react'
import { UrlObject } from 'url'
import {
  normalizePathTrailingSlash,
  removePathTrailingSlash,
} from '../../../client/normalize-trailing-slash'
import { GoodPageCache, StyleSheetTuple } from '../../../client/page-loader'
import {
  getClientBuildManifest,
  isAssetError,
  markAssetError,
} from '../../../client/route-loader'
import { denormalizePagePath } from '../../server/denormalize-page-path'
import mitt, { MittEmitter } from '../mitt'
import {
  AppContextType,
  formatWithValidation,
  getLocationOrigin,
  getURL,
  loadGetInitialProps,
  NextPageContext,
  ST,
} from '../utils'
import escapePathDelimiters from './utils/escape-path-delimiters'
import { isDynamicRoute } from './utils/is-dynamic'
import { parseRelativeUrl } from './utils/parse-relative-url'
import { searchParamsToUrlQuery } from './utils/querystring'
import resolveRewrites from './utils/resolve-rewrites'
import { getRouteMatcher } from './utils/route-matcher'
import { getRouteRegex } from './utils/route-regex'

interface TransitionOptions {
  shallow?: boolean
  locale?: string | false
}

interface NextHistoryState {
  url: string
  as: string
  options: TransitionOptions
}

type HistoryState = null | { __N: false } | ({ __N: true } & NextHistoryState)

const basePath = (process.env.__NEXT_ROUTER_BASEPATH as string) || ''

function buildCancellationError() {
  return Object.assign(new Error('Route Cancelled'), {
    cancelled: true,
  })
}

function addPathPrefix(path: string, prefix?: string) {
  return prefix && path.startsWith('/')
    ? path === '/'
      ? normalizePathTrailingSlash(prefix)
      : `${prefix}${path}`
    : path
}

export function addLocale(
  path: string,
  locale?: string | false,
  defaultLocale?: string
) {
  if (process.env.__NEXT_I18N_SUPPORT) {
    return locale &&
      locale !== defaultLocale &&
      !path.startsWith('/' + locale + '/') &&
      path !== '/' + locale
      ? addPathPrefix(path, '/' + locale)
      : path
  }
  return path
}

export function delLocale(path: string, locale?: string) {
  if (process.env.__NEXT_I18N_SUPPORT) {
    return locale &&
      (path.startsWith('/' + locale + '/') || path === '/' + locale)
      ? path.substr(locale.length + 1) || '/'
      : path
  }
  return path
}

export function hasBasePath(path: string): boolean {
  return path === basePath || path.startsWith(basePath + '/')
}

export function addBasePath(path: string): string {
  // we only add the basepath on relative urls
  return addPathPrefix(path, basePath)
}

export function delBasePath(path: string): string {
  return path.slice(basePath.length) || '/'
}

/**
 * Detects whether a given url is routable by the Next.js router (browser only).
 */
export function isLocalURL(url: string): boolean {
  if (url.startsWith('/')) return true
  try {
    // absolute urls can be local if they are on the same origin
    const locationOrigin = getLocationOrigin()
    const resolved = new URL(url, locationOrigin)
    return resolved.origin === locationOrigin && hasBasePath(resolved.pathname)
  } catch (_) {
    return false
  }
}

type Url = UrlObject | string

export function interpolateAs(
  route: string,
  asPathname: string,
  query: ParsedUrlQuery
) {
  let interpolatedRoute = ''

  const dynamicRegex = getRouteRegex(route)
  const dynamicGroups = dynamicRegex.groups
  const dynamicMatches =
    // Try to match the dynamic route against the asPath
    (asPathname !== route ? getRouteMatcher(dynamicRegex)(asPathname) : '') ||
    // Fall back to reading the values from the href
    // TODO: should this take priority; also need to change in the router.
    query

  interpolatedRoute = route
  const params = Object.keys(dynamicGroups)

  if (
    !params.every((param) => {
      let value = dynamicMatches[param] || ''
      const { repeat, optional } = dynamicGroups[param]

      // support single-level catch-all
      // TODO: more robust handling for user-error (passing `/`)
      let replaced = `[${repeat ? '...' : ''}${param}]`
      if (optional) {
        replaced = `${!value ? '/' : ''}[${replaced}]`
      }
      if (repeat && !Array.isArray(value)) value = [value]

      return (
        (optional || param in dynamicMatches) &&
        // Interpolate group into data URL if present
        (interpolatedRoute =
          interpolatedRoute!.replace(
            replaced,
            repeat
              ? (value as string[]).map(escapePathDelimiters).join('/')
              : escapePathDelimiters(value as string)
          ) || '/')
      )
    })
  ) {
    interpolatedRoute = '' // did not satisfy all requirements

    // n.b. We ignore this error because we handle warning for this case in
    // development in the `<Link>` component directly.
  }
  return {
    params,
    result: interpolatedRoute,
  }
}

function omitParmsFromQuery(query: ParsedUrlQuery, params: string[]) {
  const filteredQuery: ParsedUrlQuery = {}

  Object.keys(query).forEach((key) => {
    if (!params.includes(key)) {
      filteredQuery[key] = query[key]
    }
  })
  return filteredQuery
}

/**
 * Resolves a given hyperlink with a certain router state (basePath not included).
 * Preserves absolute urls.
 */
export function resolveHref(
  currentPath: string,
  href: Url,
  resolveAs?: boolean
): string {
  // we use a dummy base url for relative urls
  const base = new URL(currentPath, 'http://n')
  const urlAsString =
    typeof href === 'string' ? href : formatWithValidation(href)
  // Return because it cannot be routed by the Next.js router
  if (!isLocalURL(urlAsString)) {
    return (resolveAs ? [urlAsString] : urlAsString) as string
  }
  try {
    const finalUrl = new URL(urlAsString, base)
    finalUrl.pathname = normalizePathTrailingSlash(finalUrl.pathname)
    let interpolatedAs = ''

    if (
      isDynamicRoute(finalUrl.pathname) &&
      finalUrl.searchParams &&
      resolveAs
    ) {
      const query = searchParamsToUrlQuery(finalUrl.searchParams)

      const { result, params } = interpolateAs(
        finalUrl.pathname,
        finalUrl.pathname,
        query
      )

      if (result) {
        interpolatedAs = formatWithValidation({
          pathname: result,
          hash: finalUrl.hash,
          query: omitParmsFromQuery(query, params),
        })
      }
    }

    // if the origin didn't change, it means we received a relative href
    const resolvedHref =
      finalUrl.origin === base.origin
        ? finalUrl.href.slice(finalUrl.origin.length)
        : finalUrl.href

    return (resolveAs
      ? [resolvedHref, interpolatedAs || resolvedHref]
      : resolvedHref) as string
  } catch (_) {
    return (resolveAs ? [urlAsString] : urlAsString) as string
  }
}

function prepareUrlAs(router: NextRouter, url: Url, as: Url) {
  // If url and as provided as an object representation,
  // we'll format them into the string version here.
  return {
    url: addBasePath(resolveHref(router.pathname, url)),
    as: as ? addBasePath(resolveHref(router.pathname, as)) : as,
  }
}

export type BaseRouter = {
  route: string
  pathname: string
  query: ParsedUrlQuery
  asPath: string
  basePath: string
  locale?: string
  locales?: string[]
  defaultLocale?: string
}

export type NextRouter = BaseRouter &
  Pick<
    Router,
    | 'push'
    | 'replace'
    | 'reload'
    | 'back'
    | 'prefetch'
    | 'beforePopState'
    | 'events'
    | 'isFallback'
  >

export type PrefetchOptions = {
  priority?: boolean
  locale?: string | false
}

export type PrivateRouteInfo =
  | (Omit<CompletePrivateRouteInfo, 'styleSheets'> & { initial: true })
  | CompletePrivateRouteInfo

export type CompletePrivateRouteInfo = {
  Component: ComponentType
  styleSheets: StyleSheetTuple[]
  __N_SSG?: boolean
  __N_SSP?: boolean
  props?: Record<string, any>
  err?: Error
  error?: any
}

export type AppProps = Pick<CompletePrivateRouteInfo, 'Component' | 'err'> & {
  router: Router
} & Record<string, any>
export type AppComponent = ComponentType<AppProps>

type Subscription = (data: PrivateRouteInfo, App: AppComponent) => Promise<void>

type BeforePopStateCallback = (state: NextHistoryState) => boolean

type ComponentLoadCancel = (() => void) | null

type HistoryMethod = 'replaceState' | 'pushState'

const manualScrollRestoration =
  process.env.__NEXT_SCROLL_RESTORATION &&
  typeof window !== 'undefined' &&
  'scrollRestoration' in window.history

const SSG_DATA_NOT_FOUND_ERROR = 'SSG Data NOT_FOUND'

function fetchRetry(url: string, attempts: number): Promise<any> {
  return fetch(url, {
    // Cookies are required to be present for Next.js' SSG "Preview Mode".
    // Cookies may also be required for `getServerSideProps`.
    //
    // > `fetch` won’t send cookies, unless you set the credentials init
    // > option.
    // https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
    //
    // > For maximum browser compatibility when it comes to sending &
    // > receiving cookies, always supply the `credentials: 'same-origin'`
    // > option instead of relying on the default.
    // https://github.com/github/fetch#caveats
    credentials: 'same-origin',
  }).then((res) => {
    if (!res.ok) {
      if (attempts > 1 && res.status >= 500) {
        return fetchRetry(url, attempts - 1)
      }
      if (res.status === 404) {
        // TODO: handle reloading in development from fallback returning 200
        // to on-demand-entry-handler causing it to reload periodically
        throw new Error(SSG_DATA_NOT_FOUND_ERROR)
      }
      throw new Error(`Failed to load static props`)
    }
    return res.json()
  })
}

function fetchNextData(dataHref: string, isServerRender: boolean) {
  return fetchRetry(dataHref, isServerRender ? 3 : 1).catch((err: Error) => {
    // We should only trigger a server-side transition if this was caused
    // on a client-side transition. Otherwise, we'd get into an infinite
    // loop.

    if (!isServerRender) {
      markAssetError(err)
    }
    throw err
  })
}

export default class Router implements BaseRouter {
  route: string
  pathname: string
  query: ParsedUrlQuery
  asPath: string
  basePath: string

  /**
   * Map of all components loaded in `Router`
   */
  components: { [pathname: string]: PrivateRouteInfo }
  // Static Data Cache
  sdc: { [asPath: string]: object } = {}
  sub: Subscription
  clc: ComponentLoadCancel
  pageLoader: any
  _bps: BeforePopStateCallback | undefined
  events: MittEmitter
  _wrapApp: (App: AppComponent) => any
  isSsr: boolean
  isFallback: boolean
  _inFlightRoute?: string
  _shallow?: boolean
  locale?: string
  locales?: string[]
  defaultLocale?: string

  static events: MittEmitter = mitt()

  constructor(
    pathname: string,
    query: ParsedUrlQuery,
    as: string,
    {
      initialProps,
      pageLoader,
      App,
      wrapApp,
      Component,
      err,
      subscription,
      isFallback,
      locale,
      locales,
      defaultLocale,
    }: {
      subscription: Subscription
      initialProps: any
      pageLoader: any
      Component: ComponentType
      App: AppComponent
      wrapApp: (App: AppComponent) => any
      err?: Error
      isFallback: boolean
      locale?: string
      locales?: string[]
      defaultLocale?: string
    }
  ) {
    // represents the current component key
    this.route = removePathTrailingSlash(pathname)

    // set up the component cache (by route keys)
    this.components = {}
    // We should not keep the cache, if there's an error
    // Otherwise, this cause issues when when going back and
    // come again to the errored page.
    if (pathname !== '/_error') {
      this.components[this.route] = {
        Component,
        initial: true,
        props: initialProps,
        err,
        __N_SSG: initialProps && initialProps.__N_SSG,
        __N_SSP: initialProps && initialProps.__N_SSP,
      }
    }

    this.components['/_app'] = {
      Component: App as ComponentType,
      styleSheets: [
        /* /_app does not need its stylesheets managed */
      ],
    }

    // Backwards compat for Router.router.events
    // TODO: Should be remove the following major version as it was never documented
    this.events = Router.events

    this.pageLoader = pageLoader
    this.pathname = pathname
    this.query = query
    // if auto prerendered and dynamic route wait to update asPath
    // until after mount to prevent hydration mismatch
    this.asPath =
      // @ts-ignore this is temporarily global (attached to window)
      isDynamicRoute(pathname) && __NEXT_DATA__.autoExport ? pathname : as
    this.basePath = basePath
    this.sub = subscription
    this.clc = null
    this._wrapApp = wrapApp
    // make sure to ignore extra popState in safari on navigating
    // back from external site
    this.isSsr = true

    this.isFallback = isFallback

    if (process.env.__NEXT_I18N_SUPPORT) {
      this.locale = locale
      this.locales = locales
      this.defaultLocale = defaultLocale
    }

    if (typeof window !== 'undefined') {
      // make sure "as" doesn't start with double slashes or else it can
      // throw an error as it's considered invalid
      if (as.substr(0, 2) !== '//') {
        // in order for `e.state` to work on the `onpopstate` event
        // we have to register the initial route upon initialization
        this.changeState(
          'replaceState',
          formatWithValidation({ pathname: addBasePath(pathname), query }),
          getURL(),
          { locale }
        )
      }

      window.addEventListener('popstate', this.onPopState)

      // enable custom scroll restoration handling when available
      // otherwise fallback to browser's default handling
      if (process.env.__NEXT_SCROLL_RESTORATION) {
        if (manualScrollRestoration) {
          window.history.scrollRestoration = 'manual'

          let scrollDebounceTimeout: undefined | NodeJS.Timeout

          const debouncedScrollSave = () => {
            if (scrollDebounceTimeout) clearTimeout(scrollDebounceTimeout)

            scrollDebounceTimeout = setTimeout(() => {
              const { url, as: curAs, options } = history.state
              this.changeState(
                'replaceState',
                url,
                curAs,
                Object.assign({}, options, {
                  _N_X: window.scrollX,
                  _N_Y: window.scrollY,
                })
              )
            }, 10)
          }

          window.addEventListener('scroll', debouncedScrollSave)
        }
      }
    }
  }

  onPopState = (e: PopStateEvent): void => {
    const state = e.state as HistoryState

    if (!state) {
      // We get state as undefined for two reasons.
      //  1. With older safari (< 8) and older chrome (< 34)
      //  2. When the URL changed with #
      //
      // In the both cases, we don't need to proceed and change the route.
      // (as it's already changed)
      // But we can simply replace the state with the new changes.
      // Actually, for (1) we don't need to nothing. But it's hard to detect that event.
      // So, doing the following for (1) does no harm.
      const { pathname, query } = this
      this.changeState(
        'replaceState',
        formatWithValidation({ pathname: addBasePath(pathname), query }),
        getURL()
      )
      return
    }

    if (!state.__N) {
      return
    }

    const { url, as, options } = state

    const { pathname } = parseRelativeUrl(url)

    // Make sure we don't re-render on initial load,
    // can be caused by navigating back from an external site
    if (this.isSsr && as === this.asPath && pathname === this.pathname) {
      return
    }

    // If the downstream application returns falsy, return.
    // They will then be responsible for handling the event.
    if (this._bps && !this._bps(state)) {
      return
    }

    this.change(
      'replaceState',
      url,
      as,
      Object.assign({}, options, {
        shallow: options.shallow && this._shallow,
        locale: options.locale || this.defaultLocale,
      })
    )
  }

  reload(): void {
    window.location.reload()
  }

  /**
   * Go back in history
   */
  back() {
    window.history.back()
  }

  /**
   * Performs a `pushState` with arguments
   * @param url of the route
   * @param as masks `url` for the browser
   * @param options object you can define `shallow` and other options
   */
  push(url: Url, as: Url = url, options: TransitionOptions = {}) {
    ;({ url, as } = prepareUrlAs(this, url, as))
    return this.change('pushState', url, as, options)
  }

  /**
   * Performs a `replaceState` with arguments
   * @param url of the route
   * @param as masks `url` for the browser
   * @param options object you can define `shallow` and other options
   */
  replace(url: Url, as: Url = url, options: TransitionOptions = {}) {
    ;({ url, as } = prepareUrlAs(this, url, as))
    return this.change('replaceState', url, as, options)
  }

  async change(
    method: HistoryMethod,
    url: string,
    as: string,
    options: TransitionOptions
  ): Promise<boolean> {
    if (!isLocalURL(url)) {
      window.location.href = url
      return false
    }
    let localeChange = options.locale !== this.locale

    if (process.env.__NEXT_I18N_SUPPORT) {
      this.locale =
        options.locale === false
          ? this.defaultLocale
          : options.locale || this.locale

      if (typeof options.locale === 'undefined') {
        options.locale = this.locale
      }

      const {
        normalizeLocalePath,
      } = require('../i18n/normalize-locale-path') as typeof import('../i18n/normalize-locale-path')

      const parsedAs = parseRelativeUrl(hasBasePath(as) ? delBasePath(as) : as)
      const localePathResult = normalizeLocalePath(
        parsedAs.pathname,
        this.locales
      )
      if (localePathResult.detectedLocale) {
        this.locale = localePathResult.detectedLocale
        url = addBasePath(localePathResult.pathname)
      }

      // if the locale isn't configured hard navigate to show 404 page
      if (!this.locales?.includes(this.locale!)) {
        parsedAs.pathname = addLocale(parsedAs.pathname, this.locale)
        window.location.href = formatWithValidation(parsedAs)
        return new Promise(() => {})
      }
    }

    if (!(options as any)._h) {
      this.isSsr = false
    }
    // marking route changes as a navigation start entry
    if (ST) {
      performance.mark('routeChange')
    }

    if (this._inFlightRoute) {
      this.abortComponentLoad(this._inFlightRoute)
    }

    as = addBasePath(
      addLocale(
        hasBasePath(as) ? delBasePath(as) : as,
        options.locale,
        this.defaultLocale
      )
    )
    const cleanedAs = delLocale(
      hasBasePath(as) ? delBasePath(as) : as,
      this.locale
    )
    this._inFlightRoute = as

    // If the url change is only related to a hash change
    // We should not proceed. We should only change the state.

    // WARNING: `_h` is an internal option for handing Next.js client-side
    // hydration. Your app should _never_ use this property. It may change at
    // any time without notice.
    if (!(options as any)._h && this.onlyAHashChange(cleanedAs)) {
      this.asPath = cleanedAs
      Router.events.emit('hashChangeStart', as)
      // TODO: do we need the resolved href when only a hash change?
      this.changeState(method, url, as, options)
      this.scrollToHash(cleanedAs)
      this.notify(this.components[this.route])
      Router.events.emit('hashChangeComplete', as)
      return true
    }

    let parsed = parseRelativeUrl(url)
    let { pathname, query } = parsed

    // The build manifest needs to be loaded before auto-static dynamic pages
    // get their query parameters to allow ensuring they can be parsed properly
    // when rewritten to
    let pages: any, rewrites: any
    try {
      pages = await this.pageLoader.getPageList()
      ;({ __rewrites: rewrites } = await getClientBuildManifest())
    } catch (err) {
      // If we fail to resolve the page list or client-build manifest, we must
      // do a server-side transition:
      window.location.href = as
      return false
    }

    parsed = this._resolveHref(parsed, pages) as typeof parsed

    if (parsed.pathname !== pathname) {
      pathname = parsed.pathname
      url = formatWithValidation(parsed)
    }

    // url and as should always be prefixed with basePath by this
    // point by either next/link or router.push/replace so strip the
    // basePath from the pathname to match the pages dir 1-to-1
    pathname = pathname
      ? removePathTrailingSlash(delBasePath(pathname))
      : pathname

    // If asked to change the current URL we should reload the current page
    // (not location.reload() but reload getInitialProps and other Next.js stuffs)
    // We also need to set the method = replaceState always
    // as this should not go into the history (That's how browsers work)
    // We should compare the new asPath to the current asPath, not the url
    if (!this.urlIsNew(cleanedAs) && !localeChange) {
      method = 'replaceState'
    }

    let route = removePathTrailingSlash(pathname)
    const { shallow = false } = options

    // we need to resolve the as value using rewrites for dynamic SSG
    // pages to allow building the data URL correctly
    let resolvedAs = as

    if (process.env.__NEXT_HAS_REWRITES) {
      resolvedAs = resolveRewrites(
        parseRelativeUrl(as).pathname,
        pages,
        basePath,
        rewrites,
        query,
        (p: string) => this._resolveHref({ pathname: p }, pages).pathname!
      )

      if (resolvedAs !== as) {
        const potentialHref = removePathTrailingSlash(
          this._resolveHref(
            Object.assign({}, parsed, { pathname: resolvedAs }),
            pages,
            false
          ).pathname!
        )

        // if this directly matches a page we need to update the href to
        // allow the correct page chunk to be loaded
        if (pages.includes(potentialHref)) {
          route = potentialHref
          pathname = potentialHref
          parsed.pathname = pathname
          url = formatWithValidation(parsed)
        }
      }
    }
    resolvedAs = delLocale(delBasePath(resolvedAs), this.locale)

    if (isDynamicRoute(route)) {
      const parsedAs = parseRelativeUrl(resolvedAs)
      const asPathname = parsedAs.pathname

      const routeRegex = getRouteRegex(route)
      const routeMatch = getRouteMatcher(routeRegex)(asPathname)
      const shouldInterpolate = route === asPathname
      const interpolatedAs = shouldInterpolate
        ? interpolateAs(route, asPathname, query)
        : ({} as { result: undefined; params: undefined })

      if (!routeMatch || (shouldInterpolate && !interpolatedAs.result)) {
        const missingParams = Object.keys(routeRegex.groups).filter(
          (param) => !query[param]
        )

        if (missingParams.length > 0) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `${
                shouldInterpolate
                  ? `Interpolating href`
                  : `Mismatching \`as\` and \`href\``
              } failed to manually provide ` +
                `the params: ${missingParams.join(
                  ', '
                )} in the \`href\`'s \`query\``
            )
          }

          throw new Error(
            (shouldInterpolate
              ? `The provided \`href\` (${url}) value is missing query values (${missingParams.join(
                  ', '
                )}) to be interpolated properly. `
              : `The provided \`as\` value (${asPathname}) is incompatible with the \`href\` value (${route}). `) +
              `Read more: https://err.sh/vercel/next.js/${
                shouldInterpolate
                  ? 'href-interpolation-failed'
                  : 'incompatible-href-as'
              }`
          )
        }
      } else if (shouldInterpolate) {
        as = formatWithValidation(
          Object.assign({}, parsedAs, {
            pathname: interpolatedAs.result,
            query: omitParmsFromQuery(query, interpolatedAs.params!),
          })
        )
      } else {
        // Merge params into `query`, overwriting any specified in search
        Object.assign(query, routeMatch)
      }
    }

    Router.events.emit('routeChangeStart', as)

    try {
      const routeInfo = await this.getRouteInfo(
        route,
        pathname,
        query,
        as,
        shallow
      )
      let { error, props, __N_SSG, __N_SSP } = routeInfo

      // handle redirect on client-transition
      if (
        (__N_SSG || __N_SSP) &&
        props &&
        (props as any).pageProps &&
        (props as any).pageProps.__N_REDIRECT
      ) {
        const destination = (props as any).pageProps.__N_REDIRECT

        // check if destination is internal (resolves to a page) and attempt
        // client-navigation if it is falling back to hard navigation if
        // it's not
        if (destination.startsWith('/')) {
          const parsedHref = parseRelativeUrl(destination)
          this._resolveHref(parsedHref, pages, false)

          if (pages.includes(parsedHref.pathname)) {
            const { url: newUrl, as: newAs } = prepareUrlAs(
              this,
              destination,
              destination
            )
            return this.change(method, newUrl, newAs, options)
          }
        }

        window.location.href = destination
        return new Promise(() => {})
      }

      Router.events.emit('beforeHistoryChange', as)
      this.changeState(method, url, as, options)

      if (process.env.NODE_ENV !== 'production') {
        const appComp: any = this.components['/_app'].Component
        ;(window as any).next.isPrerendered =
          appComp.getInitialProps === appComp.origGetInitialProps &&
          !(routeInfo.Component as any).getInitialProps
      }

      await this.set(route, pathname!, query, cleanedAs, routeInfo).catch(
        (e) => {
          if (e.cancelled) error = error || e
          else throw e
        }
      )

      if (error) {
        Router.events.emit('routeChangeError', error, cleanedAs)
        throw error
      }

      if (process.env.__NEXT_SCROLL_RESTORATION) {
        if (manualScrollRestoration && '_N_X' in options) {
          window.scrollTo((options as any)._N_X, (options as any)._N_Y)
        }
      }

      if (process.env.__NEXT_I18N_SUPPORT) {
        if (this.locale) {
          document.documentElement.lang = this.locale
        }
      }
      Router.events.emit('routeChangeComplete', as)

      return true
    } catch (err) {
      if (err.cancelled) {
        return false
      }
      throw err
    }
  }

  changeState(
    method: HistoryMethod,
    url: string,
    as: string,
    options: TransitionOptions = {}
  ): void {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof window.history === 'undefined') {
        console.error(`Warning: window.history is not available.`)
        return
      }

      if (typeof window.history[method] === 'undefined') {
        console.error(`Warning: window.history.${method} is not available`)
        return
      }
    }

    if (method !== 'pushState' || getURL() !== as) {
      this._shallow = options.shallow
      window.history[method](
        {
          url,
          as,
          options,
          __N: true,
        } as HistoryState,
        // Most browsers currently ignores this parameter, although they may use it in the future.
        // Passing the empty string here should be safe against future changes to the method.
        // https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState
        '',
        as
      )
    }
  }

  async handleRouteInfoError(
    err: Error & { code: any; cancelled: boolean },
    pathname: string,
    query: ParsedUrlQuery,
    as: string,
    loadErrorFail?: boolean
  ): Promise<CompletePrivateRouteInfo> {
    if (err.cancelled) {
      // bubble up cancellation errors
      throw err
    }

    if (isAssetError(err) || loadErrorFail) {
      Router.events.emit('routeChangeError', err, as)

      // If we can't load the page it could be one of following reasons
      //  1. Page doesn't exists
      //  2. Page does exist in a different zone
      //  3. Internal error while loading the page

      // So, doing a hard reload is the proper way to deal with this.
      window.location.href = as

      // Changing the URL doesn't block executing the current code path.
      // So let's throw a cancellation error stop the routing logic.
      throw buildCancellationError()
    }

    try {
      let Component: ComponentType
      let styleSheets: StyleSheetTuple[]
      let props: Record<string, any> | undefined
      const ssg404 = err.message === SSG_DATA_NOT_FOUND_ERROR

      if (ssg404) {
        try {
          let mod: any
          ;({ page: Component, styleSheets, mod } = await this.fetchComponent(
            '/404'
          ))

          // TODO: should we tolerate these props missing and still render the
          // page instead of falling back to _error?
          if (mod && mod.__N_SSG) {
            props = await this._getStaticData(
              this.pageLoader.getDataHref('/404', '/404', true, this.locale)
            )
          }
        } catch (_err) {
          // non-fatal fallback to _error
        }
      }

      if (
        typeof Component! === 'undefined' ||
        typeof styleSheets! === 'undefined'
      ) {
        ;({ page: Component, styleSheets } = await this.fetchComponent(
          '/_error'
        ))
      }

      const routeInfo: CompletePrivateRouteInfo = {
        props,
        Component,
        styleSheets,
        err: ssg404 ? undefined : err,
        error: ssg404 ? undefined : err,
      }

      if (!routeInfo.props) {
        try {
          routeInfo.props = await this.getInitialProps(Component, {
            err,
            pathname,
            query,
          } as any)
        } catch (gipErr) {
          console.error('Error in error page `getInitialProps`: ', gipErr)
          routeInfo.props = {}
        }
      }

      return routeInfo
    } catch (routeInfoErr) {
      return this.handleRouteInfoError(routeInfoErr, pathname, query, as, true)
    }
  }

  async getRouteInfo(
    route: string,
    pathname: string,
    query: any,
    as: string,
    shallow: boolean = false
  ): Promise<PrivateRouteInfo> {
    try {
      const existingRouteInfo: PrivateRouteInfo | undefined = this.components[
        route
      ]
      if (shallow && existingRouteInfo && this.route === route) {
        return existingRouteInfo
      }

      const cachedRouteInfo: CompletePrivateRouteInfo | undefined =
        existingRouteInfo && 'initial' in existingRouteInfo
          ? undefined
          : existingRouteInfo
      const routeInfo: CompletePrivateRouteInfo = cachedRouteInfo
        ? cachedRouteInfo
        : await this.fetchComponent(route).then((res) => ({
            Component: res.page,
            styleSheets: res.styleSheets,
            __N_SSG: res.mod.__N_SSG,
            __N_SSP: res.mod.__N_SSP,
          }))

      const { Component, __N_SSG, __N_SSP } = routeInfo

      if (process.env.NODE_ENV !== 'production') {
        const { isValidElementType } = require('react-is')
        if (!isValidElementType(Component)) {
          throw new Error(
            `The default export is not a React Component in page: "${pathname}"`
          )
        }
      }

      let dataHref: string | undefined

      if (__N_SSG || __N_SSP) {
        dataHref = this.pageLoader.getDataHref(
          formatWithValidation({ pathname, query }),
          delBasePath(as),
          __N_SSG,
          this.locale
        )
      }

      const props = await this._getData<CompletePrivateRouteInfo>(() =>
        __N_SSG
          ? this._getStaticData(dataHref!)
          : __N_SSP
          ? this._getServerData(dataHref!)
          : this.getInitialProps(
              Component,
              // we provide AppTree later so this needs to be `any`
              {
                pathname,
                query,
                asPath: as,
              } as any
            )
      )

      routeInfo.props = props
      this.components[route] = routeInfo
      return routeInfo
    } catch (err) {
      return this.handleRouteInfoError(err, pathname, query, as)
    }
  }

  set(
    route: string,
    pathname: string,
    query: ParsedUrlQuery,
    as: string,
    data: PrivateRouteInfo
  ): Promise<void> {
    this.isFallback = false

    this.route = route
    this.pathname = pathname
    this.query = query
    this.asPath = as
    return this.notify(data)
  }

  /**
   * Callback to execute before replacing router state
   * @param cb callback to be executed
   */
  beforePopState(cb: BeforePopStateCallback) {
    this._bps = cb
  }

  onlyAHashChange(as: string): boolean {
    if (!this.asPath) return false
    const [oldUrlNoHash, oldHash] = this.asPath.split('#')
    const [newUrlNoHash, newHash] = as.split('#')

    // Makes sure we scroll to the provided hash if the url/hash are the same
    if (newHash && oldUrlNoHash === newUrlNoHash && oldHash === newHash) {
      return true
    }

    // If the urls are change, there's more than a hash change
    if (oldUrlNoHash !== newUrlNoHash) {
      return false
    }

    // If the hash has changed, then it's a hash only change.
    // This check is necessary to handle both the enter and
    // leave hash === '' cases. The identity case falls through
    // and is treated as a next reload.
    return oldHash !== newHash
  }

  scrollToHash(as: string): void {
    const [, hash] = as.split('#')
    // Scroll to top if the hash is just `#` with no value
    if (hash === '') {
      window.scrollTo(0, 0)
      return
    }

    // First we check if the element by id is found
    const idEl = document.getElementById(hash)
    if (idEl) {
      idEl.scrollIntoView()
      return
    }
    // If there's no element with the id, we check the `name` property
    // To mirror browsers
    const nameEl = document.getElementsByName(hash)[0]
    if (nameEl) {
      nameEl.scrollIntoView()
    }
  }

  urlIsNew(asPath: string): boolean {
    return this.asPath !== asPath
  }

  _resolveHref(parsedHref: UrlObject, pages: string[], applyBasePath = true) {
    const { pathname } = parsedHref
    const cleanPathname = removePathTrailingSlash(
      denormalizePagePath(applyBasePath ? delBasePath(pathname!) : pathname!)
    )

    if (cleanPathname === '/404' || cleanPathname === '/_error') {
      return parsedHref
    }

    // handle resolving href for dynamic routes
    if (!pages.includes(cleanPathname!)) {
      // eslint-disable-next-line array-callback-return
      pages.some((page) => {
        if (
          isDynamicRoute(page) &&
          getRouteRegex(page).re.test(cleanPathname!)
        ) {
          parsedHref.pathname = applyBasePath ? addBasePath(page) : page
          return true
        }
      })
    }
    return parsedHref
  }

  /**
   * Prefetch page code, you may wait for the data during page rendering.
   * This feature only works in production!
   * @param url the href of prefetched page
   * @param asPath the as path of the prefetched page
   */
  async prefetch(
    url: string,
    asPath: string = url,
    options: PrefetchOptions = {}
  ): Promise<void> {
    let parsed = parseRelativeUrl(url)

    let { pathname } = parsed

    if (process.env.__NEXT_I18N_SUPPORT) {
      const normalizeLocalePath = require('../i18n/normalize-locale-path')
        .normalizeLocalePath as typeof import('../i18n/normalize-locale-path').normalizeLocalePath

      if (options.locale === false) {
        pathname = normalizeLocalePath!(pathname, this.locales).pathname
        parsed.pathname = pathname
        url = formatWithValidation(parsed)

        let parsedAs = parseRelativeUrl(asPath)
        const localePathResult = normalizeLocalePath!(
          parsedAs.pathname,
          this.locales
        )
        parsedAs.pathname = localePathResult.pathname
        options.locale = localePathResult.detectedLocale || this.defaultLocale
        asPath = formatWithValidation(parsedAs)
      }
    }

    const pages = await this.pageLoader.getPageList()

    parsed = this._resolveHref(parsed, pages, false) as typeof parsed

    if (parsed.pathname !== pathname) {
      pathname = parsed.pathname
      url = formatWithValidation(parsed)
    }

    // Prefetch is not supported in development mode because it would trigger on-demand-entries
    if (process.env.NODE_ENV !== 'production') {
      return
    }

    const route = removePathTrailingSlash(pathname)
    await Promise.all([
      this.pageLoader._isSsg(url).then((isSsg: boolean) => {
        return isSsg
          ? this._getStaticData(
              this.pageLoader.getDataHref(
                url,
                asPath,
                true,
                typeof options.locale !== 'undefined'
                  ? options.locale
                  : this.locale
              )
            )
          : false
      }),
      this.pageLoader[options.priority ? 'loadPage' : 'prefetch'](route),
    ])
  }

  async fetchComponent(route: string): Promise<GoodPageCache> {
    let cancelled = false
    const cancel = (this.clc = () => {
      cancelled = true
    })

    const componentResult = await this.pageLoader.loadPage(route)

    if (cancelled) {
      const error: any = new Error(
        `Abort fetching component for route: "${route}"`
      )
      error.cancelled = true
      throw error
    }

    if (cancel === this.clc) {
      this.clc = null
    }

    return componentResult
  }

  _getData<T>(fn: () => Promise<T>): Promise<T> {
    let cancelled = false
    const cancel = () => {
      cancelled = true
    }
    this.clc = cancel
    return fn().then((data) => {
      if (cancel === this.clc) {
        this.clc = null
      }

      if (cancelled) {
        const err: any = new Error('Loading initial props cancelled')
        err.cancelled = true
        throw err
      }

      return data
    })
  }

  _getStaticData(dataHref: string): Promise<object> {
    const { href: cacheKey } = new URL(dataHref, window.location.href)
    if (process.env.NODE_ENV === 'production' && this.sdc[cacheKey]) {
      return Promise.resolve(this.sdc[cacheKey])
    }
    return fetchNextData(dataHref, this.isSsr).then((data) => {
      this.sdc[cacheKey] = data
      return data
    })
  }

  _getServerData(dataHref: string): Promise<object> {
    return fetchNextData(dataHref, this.isSsr)
  }

  getInitialProps(
    Component: ComponentType,
    ctx: NextPageContext
  ): Promise<any> {
    const { Component: App } = this.components['/_app']
    const AppTree = this._wrapApp(App as AppComponent)
    ctx.AppTree = AppTree
    return loadGetInitialProps<AppContextType<Router>>(App, {
      AppTree,
      Component,
      router: this,
      ctx,
    })
  }

  abortComponentLoad(as: string): void {
    if (this.clc) {
      Router.events.emit('routeChangeError', buildCancellationError(), as)
      this.clc()
      this.clc = null
    }
  }

  notify(data: PrivateRouteInfo): Promise<void> {
    return this.sub(data, this.components['/_app'].Component as AppComponent)
  }
}
