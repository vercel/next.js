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
import { RouterEvent } from '../../../client/router'
import type { DomainLocale } from '../../../server/config'
import { denormalizePagePath } from '../../../server/denormalize-page-path'
import { normalizeLocalePath } from '../i18n/normalize-locale-path'
import mitt, { MittEmitter } from '../mitt'
import {
  AppContextType,
  formatWithValidation,
  getLocationOrigin,
  getURL,
  loadGetInitialProps,
  NextPageContext,
  ST,
  NEXT_DATA,
} from '../utils'
import { isDynamicRoute } from './utils/is-dynamic'
import { parseRelativeUrl } from './utils/parse-relative-url'
import { searchParamsToUrlQuery } from './utils/querystring'
import resolveRewrites from './utils/resolve-rewrites'
import { getRouteMatcher } from './utils/route-matcher'
import { getRouteRegex } from './utils/route-regex'

declare global {
  interface Window {
    /* prod */
    __NEXT_DATA__: NEXT_DATA
  }
}

interface RouteProperties {
  shallow: boolean
}

interface TransitionOptions {
  shallow?: boolean
  locale?: string | false
  scroll?: boolean
}

interface NextHistoryState {
  url: string
  as: string
  options: TransitionOptions
}

type HistoryState =
  | null
  | { __N: false }
  | ({ __N: true; idx: number } & NextHistoryState)

let detectDomainLocale: typeof import('../i18n/detect-domain-locale').detectDomainLocale

if (process.env.__NEXT_I18N_SUPPORT) {
  detectDomainLocale = require('../i18n/detect-domain-locale')
    .detectDomainLocale
}

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
      : `${prefix}${pathNoQueryHash(path) === '/' ? path.substring(1) : path}`
    : path
}

export function getDomainLocale(
  path: string,
  locale?: string | false,
  locales?: string[],
  domainLocales?: DomainLocale[]
) {
  if (process.env.__NEXT_I18N_SUPPORT) {
    locale = locale || normalizeLocalePath(path, locales).detectedLocale

    const detectedDomain = detectDomainLocale(domainLocales, undefined, locale)

    if (detectedDomain) {
      return `http${detectedDomain.http ? '' : 's'}://${detectedDomain.domain}${
        basePath || ''
      }${locale === detectedDomain.defaultLocale ? '' : `/${locale}`}${path}`
    }
    return false
  }

  return false
}

export function addLocale(
  path: string,
  locale?: string | false,
  defaultLocale?: string
) {
  if (process.env.__NEXT_I18N_SUPPORT) {
    const pathname = pathNoQueryHash(path)
    const pathLower = pathname.toLowerCase()
    const localeLower = locale && locale.toLowerCase()

    return locale &&
      locale !== defaultLocale &&
      !pathLower.startsWith('/' + localeLower + '/') &&
      pathLower !== '/' + localeLower
      ? addPathPrefix(path, '/' + locale)
      : path
  }
  return path
}

export function delLocale(path: string, locale?: string) {
  if (process.env.__NEXT_I18N_SUPPORT) {
    const pathname = pathNoQueryHash(path)
    const pathLower = pathname.toLowerCase()
    const localeLower = locale && locale.toLowerCase()

    return locale &&
      (pathLower.startsWith('/' + localeLower + '/') ||
        pathLower === '/' + localeLower)
      ? (pathname.length === locale.length + 1 ? '/' : '') +
          path.substr(locale.length + 1)
      : path
  }
  return path
}

function pathNoQueryHash(path: string) {
  const queryIndex = path.indexOf('?')
  const hashIndex = path.indexOf('#')

  if (queryIndex > -1 || hashIndex > -1) {
    path = path.substring(0, queryIndex > -1 ? queryIndex : hashIndex)
  }
  return path
}

export function hasBasePath(path: string): boolean {
  path = pathNoQueryHash(path)
  return path === basePath || path.startsWith(basePath + '/')
}

export function addBasePath(path: string): string {
  // we only add the basepath on relative urls
  return addPathPrefix(path, basePath)
}

export function delBasePath(path: string): string {
  path = path.slice(basePath.length)
  if (!path.startsWith('/')) path = `/${path}`
  return path
}

/**
 * Detects whether a given url is routable by the Next.js router (browser only).
 */
export function isLocalURL(url: string): boolean {
  // prevent a hydration mismatch on href for url with anchor refs
  if (url.startsWith('/') || url.startsWith('#') || url.startsWith('?'))
    return true
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
              ? (value as string[])
                  .map(
                    // these values should be fully encoded instead of just
                    // path delimiter escaped since they are being inserted
                    // into the URL and we expect URL encoded segments
                    // when parsing dynamic route params
                    (segment) => encodeURIComponent(segment)
                  )
                  .join('/')
              : encodeURIComponent(value as string)
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
  router: NextRouter,
  href: Url,
  resolveAs?: boolean
): string {
  // we use a dummy base url for relative urls
  let base: URL
  const urlAsString =
    typeof href === 'string' ? href : formatWithValidation(href)

  try {
    base = new URL(
      urlAsString.startsWith('#') ? router.asPath : router.pathname,
      'http://n'
    )
  } catch (_) {
    // fallback to / for invalid asPath values e.g. //
    base = new URL('/', 'http://n')
  }
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

function stripOrigin(url: string) {
  const origin = getLocationOrigin()

  return url.startsWith(origin) ? url.substring(origin.length) : url
}

function prepareUrlAs(router: NextRouter, url: Url, as?: Url) {
  // If url and as provided as an object representation,
  // we'll format them into the string version here.
  let [resolvedHref, resolvedAs] = resolveHref(router, url, true)
  const origin = getLocationOrigin()
  const hrefHadOrigin = resolvedHref.startsWith(origin)
  const asHadOrigin = resolvedAs && resolvedAs.startsWith(origin)

  resolvedHref = stripOrigin(resolvedHref)
  resolvedAs = resolvedAs ? stripOrigin(resolvedAs) : resolvedAs

  const preparedUrl = hrefHadOrigin ? resolvedHref : addBasePath(resolvedHref)
  const preparedAs = as
    ? stripOrigin(resolveHref(router, as))
    : resolvedAs || resolvedHref

  return {
    url: preparedUrl,
    as: asHadOrigin ? preparedAs : addBasePath(preparedAs),
  }
}

function resolveDynamicRoute(pathname: string, pages: string[]) {
  const cleanPathname = removePathTrailingSlash(denormalizePagePath(pathname!))

  if (cleanPathname === '/404' || cleanPathname === '/_error') {
    return pathname
  }

  // handle resolving href for dynamic routes
  if (!pages.includes(cleanPathname!)) {
    // eslint-disable-next-line array-callback-return
    pages.some((page) => {
      if (isDynamicRoute(page) && getRouteRegex(page).re.test(cleanPathname!)) {
        pathname = page
        return true
      }
    })
  }
  return removePathTrailingSlash(pathname)
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
  domainLocales?: DomainLocale[]
  isLocaleDomain: boolean
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
    | 'isReady'
    | 'isPreview'
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

type Subscription = (
  data: PrivateRouteInfo,
  App: AppComponent,
  resetScroll: { x: number; y: number } | null
) => Promise<void>

type BeforePopStateCallback = (state: NextHistoryState) => boolean

type ComponentLoadCancel = (() => void) | null

type HistoryMethod = 'replaceState' | 'pushState'

const manualScrollRestoration =
  process.env.__NEXT_SCROLL_RESTORATION &&
  typeof window !== 'undefined' &&
  'scrollRestoration' in window.history &&
  !!(function () {
    try {
      let v = '__next'
      // eslint-disable-next-line no-sequences
      return sessionStorage.setItem(v, v), sessionStorage.removeItem(v), true
    } catch (n) {}
  })()

const SSG_DATA_NOT_FOUND = Symbol('SSG_DATA_NOT_FOUND')

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
        return res.json().then((data) => {
          if (data.notFound) {
            return { notFound: SSG_DATA_NOT_FOUND }
          }
          throw new Error(`Failed to load static props`)
        })
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
  // In-flight Server Data Requests, for deduping
  sdr: { [asPath: string]: Promise<object> } = {}

  sub: Subscription
  clc: ComponentLoadCancel
  pageLoader: any
  _bps: BeforePopStateCallback | undefined
  events: MittEmitter<RouterEvent>
  _wrapApp: (App: AppComponent) => any
  isSsr: boolean
  isFallback: boolean
  _inFlightRoute?: string
  _shallow?: boolean
  locale?: string
  locales?: string[]
  defaultLocale?: string
  domainLocales?: DomainLocale[]
  isReady: boolean
  isPreview: boolean
  isLocaleDomain: boolean

  private _idx: number = 0

  static events: MittEmitter<RouterEvent> = mitt()

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
      domainLocales,
      isPreview,
    }: {
      subscription: Subscription
      initialProps: any
      pageLoader: any
      Component: ComponentType
      App: AppComponent
      wrapApp: (WrapAppComponent: AppComponent) => any
      err?: Error
      isFallback: boolean
      locale?: string
      locales?: string[]
      defaultLocale?: string
      domainLocales?: DomainLocale[]
      isPreview?: boolean
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
    const autoExportDynamic =
      isDynamicRoute(pathname) && self.__NEXT_DATA__.autoExport

    this.asPath = autoExportDynamic ? pathname : as
    this.basePath = basePath
    this.sub = subscription
    this.clc = null
    this._wrapApp = wrapApp
    // make sure to ignore extra popState in safari on navigating
    // back from external site
    this.isSsr = true

    this.isFallback = isFallback

    this.isReady = !!(
      self.__NEXT_DATA__.gssp ||
      self.__NEXT_DATA__.gip ||
      (!autoExportDynamic &&
        !self.location.search &&
        !process.env.__NEXT_HAS_REWRITES)
    )
    this.isPreview = !!isPreview
    this.isLocaleDomain = false

    if (process.env.__NEXT_I18N_SUPPORT) {
      this.locale = locale
      this.locales = locales
      this.defaultLocale = defaultLocale
      this.domainLocales = domainLocales
      this.isLocaleDomain = !!detectDomainLocale(
        domainLocales,
        self.location.hostname
      )
    }

    if (typeof window !== 'undefined') {
      // make sure "as" doesn't start with double slashes or else it can
      // throw an error as it's considered invalid
      if (as.substr(0, 2) !== '//') {
        // in order for `e.state` to work on the `onpopstate` event
        // we have to register the initial route upon initialization
        const options: TransitionOptions = { locale }
        ;(options as any)._shouldResolveHref = as !== pathname

        this.changeState(
          'replaceState',
          formatWithValidation({ pathname: addBasePath(pathname), query }),
          getURL(),
          options
        )
      }

      window.addEventListener('popstate', this.onPopState)

      // enable custom scroll restoration handling when available
      // otherwise fallback to browser's default handling
      if (process.env.__NEXT_SCROLL_RESTORATION) {
        if (manualScrollRestoration) {
          window.history.scrollRestoration = 'manual'
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

    let forcedScroll: { x: number; y: number } | undefined
    const { url, as, options, idx } = state
    if (process.env.__NEXT_SCROLL_RESTORATION) {
      if (manualScrollRestoration) {
        if (this._idx !== idx) {
          // Snapshot current scroll position:
          try {
            sessionStorage.setItem(
              '__next_scroll_' + this._idx,
              JSON.stringify({ x: self.pageXOffset, y: self.pageYOffset })
            )
          } catch {}

          // Restore old scroll position:
          try {
            const v = sessionStorage.getItem('__next_scroll_' + idx)
            forcedScroll = JSON.parse(v!)
          } catch {
            forcedScroll = { x: 0, y: 0 }
          }
        }
      }
    }
    this._idx = idx

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
      Object.assign<{}, TransitionOptions, TransitionOptions>({}, options, {
        shallow: options.shallow && this._shallow,
        locale: options.locale || this.defaultLocale,
      }),
      forcedScroll
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
  push(url: Url, as?: Url, options: TransitionOptions = {}) {
    if (process.env.__NEXT_SCROLL_RESTORATION) {
      // TODO: remove in the future when we update history before route change
      // is complete, as the popstate event should handle this capture.
      if (manualScrollRestoration) {
        try {
          // Snapshot scroll position right before navigating to a new page:
          sessionStorage.setItem(
            '__next_scroll_' + this._idx,
            JSON.stringify({ x: self.pageXOffset, y: self.pageYOffset })
          )
        } catch {}
      }
    }
    ;({ url, as } = prepareUrlAs(this, url, as))
    return this.change('pushState', url, as, options)
  }

  /**
   * Performs a `replaceState` with arguments
   * @param url of the route
   * @param as masks `url` for the browser
   * @param options object you can define `shallow` and other options
   */
  replace(url: Url, as?: Url, options: TransitionOptions = {}) {
    ;({ url, as } = prepareUrlAs(this, url, as))
    return this.change('replaceState', url, as, options)
  }

  private async change(
    method: HistoryMethod,
    url: string,
    as: string,
    options: TransitionOptions,
    forcedScroll?: { x: number; y: number }
  ): Promise<boolean> {
    if (!isLocalURL(url)) {
      window.location.href = url
      return false
    }
    const shouldResolveHref =
      url === as || (options as any)._h || (options as any)._shouldResolveHref

    // for static pages with query params in the URL we delay
    // marking the router ready until after the query is updated
    if ((options as any)._h) {
      this.isReady = true
    }

    const prevLocale = this.locale

    if (process.env.__NEXT_I18N_SUPPORT) {
      this.locale =
        options.locale === false
          ? this.defaultLocale
          : options.locale || this.locale

      if (typeof options.locale === 'undefined') {
        options.locale = this.locale
      }

      const parsedAs = parseRelativeUrl(hasBasePath(as) ? delBasePath(as) : as)
      const localePathResult = normalizeLocalePath(
        parsedAs.pathname,
        this.locales
      )

      if (localePathResult.detectedLocale) {
        this.locale = localePathResult.detectedLocale
        parsedAs.pathname = addBasePath(parsedAs.pathname)
        as = formatWithValidation(parsedAs)
        url = addBasePath(
          normalizeLocalePath(
            hasBasePath(url) ? delBasePath(url) : url,
            this.locales
          ).pathname
        )
      }
      let didNavigate = false

      // we need to wrap this in the env check again since regenerator runtime
      // moves this on its own due to the return
      if (process.env.__NEXT_I18N_SUPPORT) {
        // if the locale isn't configured hard navigate to show 404 page
        if (!this.locales?.includes(this.locale!)) {
          parsedAs.pathname = addLocale(parsedAs.pathname, this.locale)
          window.location.href = formatWithValidation(parsedAs)
          // this was previously a return but was removed in favor
          // of better dead code elimination with regenerator runtime
          didNavigate = true
        }
      }

      const detectedDomain = detectDomainLocale(
        this.domainLocales,
        undefined,
        this.locale
      )

      // we need to wrap this in the env check again since regenerator runtime
      // moves this on its own due to the return
      if (process.env.__NEXT_I18N_SUPPORT) {
        // if we are navigating to a domain locale ensure we redirect to the
        // correct domain
        if (
          !didNavigate &&
          detectedDomain &&
          this.isLocaleDomain &&
          self.location.hostname !== detectedDomain.domain
        ) {
          const asNoBasePath = delBasePath(as)
          window.location.href = `http${detectedDomain.http ? '' : 's'}://${
            detectedDomain.domain
          }${addBasePath(
            `${
              this.locale === detectedDomain.defaultLocale
                ? ''
                : `/${this.locale}`
            }${asNoBasePath === '/' ? '' : asNoBasePath}` || '/'
          )}`
          // this was previously a return but was removed in favor
          // of better dead code elimination with regenerator runtime
          didNavigate = true
        }
      }

      if (didNavigate) {
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

    const { shallow = false } = options
    const routeProps = { shallow }

    if (this._inFlightRoute) {
      this.abortComponentLoad(this._inFlightRoute, routeProps)
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

    let localeChange = prevLocale !== this.locale

    // If the url change is only related to a hash change
    // We should not proceed. We should only change the state.

    // WARNING: `_h` is an internal option for handing Next.js client-side
    // hydration. Your app should _never_ use this property. It may change at
    // any time without notice.
    if (
      !(options as any)._h &&
      this.onlyAHashChange(cleanedAs) &&
      !localeChange
    ) {
      this.asPath = cleanedAs
      Router.events.emit('hashChangeStart', as, routeProps)
      // TODO: do we need the resolved href when only a hash change?
      this.changeState(method, url, as, options)
      this.scrollToHash(cleanedAs)
      this.notify(this.components[this.route], null)
      Router.events.emit('hashChangeComplete', as, routeProps)
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

    // If asked to change the current URL we should reload the current page
    // (not location.reload() but reload getInitialProps and other Next.js stuffs)
    // We also need to set the method = replaceState always
    // as this should not go into the history (That's how browsers work)
    // We should compare the new asPath to the current asPath, not the url
    if (!this.urlIsNew(cleanedAs) && !localeChange) {
      method = 'replaceState'
    }

    // we need to resolve the as value using rewrites for dynamic SSG
    // pages to allow building the data URL correctly
    let resolvedAs = as

    // url and as should always be prefixed with basePath by this
    // point by either next/link or router.push/replace so strip the
    // basePath from the pathname to match the pages dir 1-to-1
    pathname = pathname
      ? removePathTrailingSlash(delBasePath(pathname))
      : pathname

    if (shouldResolveHref && pathname !== '/_error') {
      ;(options as any)._shouldResolveHref = true

      if (process.env.__NEXT_HAS_REWRITES && as.startsWith('/')) {
        const rewritesResult = resolveRewrites(
          addBasePath(addLocale(cleanedAs, this.locale)),
          pages,
          rewrites,
          query,
          (p: string) => resolveDynamicRoute(p, pages),
          this.locales
        )
        resolvedAs = rewritesResult.asPath

        if (rewritesResult.matchedPage && rewritesResult.resolvedHref) {
          // if this directly matches a page we need to update the href to
          // allow the correct page chunk to be loaded
          pathname = rewritesResult.resolvedHref
          parsed.pathname = addBasePath(pathname)
          url = formatWithValidation(parsed)
        }
      } else {
        parsed.pathname = resolveDynamicRoute(pathname, pages)

        if (parsed.pathname !== pathname) {
          pathname = parsed.pathname
          parsed.pathname = addBasePath(pathname)
          url = formatWithValidation(parsed)
        }
      }
    }

    const route = removePathTrailingSlash(pathname)

    if (!isLocalURL(as)) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `Invalid href: "${url}" and as: "${as}", received relative href and external as` +
            `\nSee more info: https://nextjs.org/docs/messages/invalid-relative-url-external-as`
        )
      }

      window.location.href = as
      return false
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
              `Read more: https://nextjs.org/docs/messages/${
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

    Router.events.emit('routeChangeStart', as, routeProps)

    try {
      let routeInfo = await this.getRouteInfo(
        route,
        pathname,
        query,
        as,
        resolvedAs,
        routeProps
      )
      let { error, props, __N_SSG, __N_SSP } = routeInfo

      // handle redirect on client-transition
      if ((__N_SSG || __N_SSP) && props) {
        if ((props as any).pageProps && (props as any).pageProps.__N_REDIRECT) {
          const destination = (props as any).pageProps.__N_REDIRECT

          // check if destination is internal (resolves to a page) and attempt
          // client-navigation if it is falling back to hard navigation if
          // it's not
          if (destination.startsWith('/')) {
            const parsedHref = parseRelativeUrl(destination)
            parsedHref.pathname = resolveDynamicRoute(
              parsedHref.pathname,
              pages
            )

            const { url: newUrl, as: newAs } = prepareUrlAs(
              this,
              destination,
              destination
            )
            return this.change(method, newUrl, newAs, options)
          }

          window.location.href = destination
          return new Promise(() => {})
        }

        this.isPreview = !!props.__N_PREVIEW

        // handle SSG data 404
        if (props.notFound === SSG_DATA_NOT_FOUND) {
          let notFoundRoute

          try {
            await this.fetchComponent('/404')
            notFoundRoute = '/404'
          } catch (_) {
            notFoundRoute = '/_error'
          }

          routeInfo = await this.getRouteInfo(
            notFoundRoute,
            notFoundRoute,
            query,
            as,
            resolvedAs,
            { shallow: false }
          )
        }
      }

      Router.events.emit('beforeHistoryChange', as, routeProps)
      this.changeState(method, url, as, options)

      if (process.env.NODE_ENV !== 'production') {
        const appComp: any = this.components['/_app'].Component
        ;(window as any).next.isPrerendered =
          appComp.getInitialProps === appComp.origGetInitialProps &&
          !(routeInfo.Component as any).getInitialProps
      }

      if (
        (options as any)._h &&
        pathname === '/_error' &&
        self.__NEXT_DATA__.props?.pageProps?.statusCode === 500 &&
        props?.pageProps
      ) {
        // ensure statusCode is still correct for static 500 page
        // when updating query information
        props.pageProps.statusCode = 500
      }

      // shallow routing is only allowed for same page URL changes.
      const isValidShallowRoute = options.shallow && this.route === route

      const shouldScroll = options.scroll ?? !isValidShallowRoute
      const resetScroll = shouldScroll ? { x: 0, y: 0 } : null
      await this.set(
        route,
        pathname!,
        query,
        cleanedAs,
        routeInfo,
        forcedScroll ?? resetScroll
      ).catch((e) => {
        if (e.cancelled) error = error || e
        else throw e
      })

      if (error) {
        Router.events.emit('routeChangeError', error, cleanedAs, routeProps)
        throw error
      }

      if (process.env.__NEXT_I18N_SUPPORT) {
        if (this.locale) {
          document.documentElement.lang = this.locale
        }
      }
      Router.events.emit('routeChangeComplete', as, routeProps)

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
          idx: this._idx = method !== 'pushState' ? this._idx : this._idx + 1,
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
    routeProps: RouteProperties,
    loadErrorFail?: boolean
  ): Promise<CompletePrivateRouteInfo> {
    if (err.cancelled) {
      // bubble up cancellation errors
      throw err
    }

    if (isAssetError(err) || loadErrorFail) {
      Router.events.emit('routeChangeError', err, as, routeProps)

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
        err,
        error: err,
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
      return this.handleRouteInfoError(
        routeInfoErr,
        pathname,
        query,
        as,
        routeProps,
        true
      )
    }
  }

  async getRouteInfo(
    route: string,
    pathname: string,
    query: any,
    as: string,
    resolvedAs: string,
    routeProps: RouteProperties
  ): Promise<PrivateRouteInfo> {
    try {
      const existingRouteInfo: PrivateRouteInfo | undefined = this.components[
        route
      ]
      if (routeProps.shallow && existingRouteInfo && this.route === route) {
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
          resolvedAs,
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
                locale: this.locale,
                locales: this.locales,
                defaultLocale: this.defaultLocale,
              } as any
            )
      )

      routeInfo.props = props
      this.components[route] = routeInfo
      return routeInfo
    } catch (err) {
      return this.handleRouteInfoError(err, pathname, query, as, routeProps)
    }
  }

  set(
    route: string,
    pathname: string,
    query: ParsedUrlQuery,
    as: string,
    data: PrivateRouteInfo,
    resetScroll: { x: number; y: number } | null
  ): Promise<void> {
    this.isFallback = false

    this.route = route
    this.pathname = pathname
    this.query = query
    this.asPath = as
    return this.notify(data, resetScroll)
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
    // Scroll to top if the hash is just `#` with no value or `#top`
    // To mirror browsers
    if (hash === '' || hash === 'top') {
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
    let resolvedAs = asPath

    if (process.env.__NEXT_HAS_REWRITES && asPath.startsWith('/')) {
      let rewrites: any
      ;({ __rewrites: rewrites } = await getClientBuildManifest())

      const rewritesResult = resolveRewrites(
        addBasePath(addLocale(asPath, this.locale)),
        pages,
        rewrites,
        parsed.query,
        (p: string) => resolveDynamicRoute(p, pages),
        this.locales
      )
      resolvedAs = delLocale(delBasePath(rewritesResult.asPath), this.locale)

      if (rewritesResult.matchedPage && rewritesResult.resolvedHref) {
        // if this directly matches a page we need to update the href to
        // allow the correct page chunk to be loaded
        pathname = rewritesResult.resolvedHref
        parsed.pathname = pathname
        url = formatWithValidation(parsed)
      }
    } else {
      parsed.pathname = resolveDynamicRoute(parsed.pathname, pages)

      if (parsed.pathname !== pathname) {
        pathname = parsed.pathname
        parsed.pathname = pathname
        url = formatWithValidation(parsed)
      }
    }
    const route = removePathTrailingSlash(pathname)

    // Prefetch is not supported in development mode because it would trigger on-demand-entries
    if (process.env.NODE_ENV !== 'production') {
      return
    }

    await Promise.all([
      this.pageLoader._isSsg(route).then((isSsg: boolean) => {
        return isSsg
          ? this._getStaticData(
              this.pageLoader.getDataHref(
                url,
                resolvedAs,
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
    if (
      process.env.NODE_ENV === 'production' &&
      !this.isPreview &&
      this.sdc[cacheKey]
    ) {
      return Promise.resolve(this.sdc[cacheKey])
    }
    return fetchNextData(dataHref, this.isSsr).then((data) => {
      this.sdc[cacheKey] = data
      return data
    })
  }

  _getServerData(dataHref: string): Promise<object> {
    const { href: resourceKey } = new URL(dataHref, window.location.href)
    if (this.sdr[resourceKey]) {
      return this.sdr[resourceKey]
    }
    return (this.sdr[resourceKey] = fetchNextData(dataHref, this.isSsr)
      .then((data) => {
        delete this.sdr[resourceKey]
        return data
      })
      .catch((err) => {
        delete this.sdr[resourceKey]
        throw err
      }))
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

  abortComponentLoad(as: string, routeProps: RouteProperties): void {
    if (this.clc) {
      Router.events.emit(
        'routeChangeError',
        buildCancellationError(),
        as,
        routeProps
      )
      this.clc()
      this.clc = null
    }
  }

  notify(
    data: PrivateRouteInfo,
    resetScroll: { x: number; y: number } | null
  ): Promise<void> {
    return this.sub(
      data,
      this.components['/_app'].Component as AppComponent,
      resetScroll
    )
  }
}
