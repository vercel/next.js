import { ComponentType } from 'react'
import type { ClientSsgManifest } from '../build'
import type { ClientBuildManifest } from '../build/webpack/plugins/build-manifest-plugin'
import type { MittEmitter } from '../next-server/lib/mitt'
import mitt from '../next-server/lib/mitt'
import {
  addBasePath,
  addLocale,
  interpolateAs,
  markLoadingError,
} from '../next-server/lib/router/router'
import getAssetPathFromRoute from '../next-server/lib/router/utils/get-asset-path-from-route'
import { isDynamicRoute } from '../next-server/lib/router/utils/is-dynamic'
import { parseRelativeUrl } from '../next-server/lib/router/utils/parse-relative-url'

export const looseToArray = <T extends {}>(input: any): T[] =>
  [].slice.call(input)

function hasRel(rel: string, link?: HTMLLinkElement) {
  try {
    link = document.createElement('link')
    return link.relList.supports(rel)
  } catch {}
}

function pageLoadError(route: string) {
  return markLoadingError(new Error(`Error loading ${route}`))
}

export const INITIAL_CSS_LOAD_ERROR = Symbol('INITIAL_CSS_LOAD_ERROR')

const relPrefetch =
  hasRel('preload') && !hasRel('prefetch')
    ? // https://caniuse.com/#feat=link-rel-preload
      // macOS and iOS (Safari does not support prefetch)
      'preload'
    : // https://caniuse.com/#feat=link-rel-prefetch
      // IE 11, Edge 12+, nearly all evergreen
      'prefetch'

const hasNoModule = 'noModule' in document.createElement('script')

function normalizeRoute(route: string) {
  if (route[0] !== '/') {
    throw new Error(`Route name should start with a "/", got "${route}"`)
  }

  if (route === '/') return route
  return route.replace(/\/$/, '')
}

function appendLink(
  href: string,
  rel: string,
  as?: string,
  link?: HTMLLinkElement
): Promise<any> {
  return new Promise((res, rej) => {
    link = document.createElement('link')

    // The order of property assignment here is intentional:
    if (as) link!.as = as
    link!.rel = rel
    link!.crossOrigin = process.env.__NEXT_CROSS_ORIGIN!
    link!.onload = res
    link!.onerror = rej

    // `href` should always be last:
    link!.href = href

    document.head.appendChild(link)
  })
}

function loadScript(url: string): Promise<any> {
  return new Promise((res, rej) => {
    const script = document.createElement('script')
    if (process.env.__NEXT_MODERN_BUILD && hasNoModule) {
      script.type = 'module'
    }
    script.crossOrigin = process.env.__NEXT_CROSS_ORIGIN!
    script.src = url
    script.onload = res
    script.onerror = () => rej(pageLoadError(url))
    document.body.appendChild(script)
  })
}

export type StyleSheetTuple = { href: string; text: string }
export type GoodPageCache = {
  page: ComponentType
  mod: any
  styleSheets: StyleSheetTuple[]
}
export type PageCacheEntry = { error: any } | GoodPageCache

export default class PageLoader {
  private initialPage: string
  private buildId: string
  private assetPrefix: string
  private pageCache: Record<string, PageCacheEntry>
  private cssc: Record<string, Promise<string>>
  private pageRegisterEvents: MittEmitter
  private loadingRoutes: Record<string, boolean>
  private promisedBuildManifest?: Promise<ClientBuildManifest>
  private promisedSsgManifest?: Promise<ClientSsgManifest>
  private promisedDevPagesManifest?: Promise<any>

  constructor(buildId: string, assetPrefix: string, initialPage: string) {
    this.initialPage = initialPage

    this.buildId = buildId
    this.assetPrefix = assetPrefix

    this.pageCache = {}
    this.cssc = {}
    this.pageRegisterEvents = mitt()
    this.loadingRoutes = {
      // By default these 2 pages are being loaded in the initial html
      '/_app': true,
    }

    // TODO: get rid of this limitation for rendering the error page
    if (initialPage !== '/_error') {
      this.loadingRoutes[initialPage] = true
    }

    this.promisedBuildManifest = new Promise((resolve) => {
      if ((window as any).__BUILD_MANIFEST) {
        resolve((window as any).__BUILD_MANIFEST)
      } else {
        ;(window as any).__BUILD_MANIFEST_CB = () => {
          resolve((window as any).__BUILD_MANIFEST)
        }
      }
    })

    /** @type {Promise<Set<string>>} */
    this.promisedSsgManifest = new Promise((resolve) => {
      if ((window as any).__SSG_MANIFEST) {
        resolve((window as any).__SSG_MANIFEST)
      } else {
        ;(window as any).__SSG_MANIFEST_CB = () => {
          resolve((window as any).__SSG_MANIFEST)
        }
      }
    })
  }

  getPageList() {
    if (process.env.NODE_ENV === 'production') {
      return this.promisedBuildManifest!.then(
        (buildManifest) => buildManifest.sortedPages
      )
    } else {
      if ((window as any).__DEV_PAGES_MANIFEST) {
        return (window as any).__DEV_PAGES_MANIFEST.pages
      } else {
        if (!this.promisedDevPagesManifest) {
          this.promisedDevPagesManifest = fetch(
            `${this.assetPrefix}/_next/static/development/_devPagesManifest.json`
          )
            .then((res) => res.json())
            .then((manifest) => {
              ;(window as any).__DEV_PAGES_MANIFEST = manifest
              return manifest.pages
            })
            .catch((err) => {
              console.log(`Failed to fetch devPagesManifest`, err)
            })
        }
        return this.promisedDevPagesManifest
      }
    }
  }

  private fetchStyleSheet(href: string): Promise<StyleSheetTuple> {
    if (!this.cssc[href]) {
      this.cssc[href] = fetch(href).then((res) => {
        if (!res.ok) throw pageLoadError(href)
        return res.text()
      })
    }
    return this.cssc[href].then((text) => ({ href, text }))
  }

  // Returns a promise for the dependencies for a particular route
  private getDependencies(route: string): Promise<string[]> {
    return this.promisedBuildManifest!.then((m) => {
      return m[route]
        ? m[route].map((url) => `${this.assetPrefix}/_next/${encodeURI(url)}`)
        : Promise.reject(pageLoadError(route))
    })
  }

  /**
   * @param {string} href the route href (file-system path)
   * @param {string} asPath the URL as shown in browser (virtual path); used for dynamic routes
   */
  getDataHref(
    href: string,
    asPath: string,
    ssg: boolean,
    locale?: string | false
  ) {
    const { pathname: hrefPathname, query, search } = parseRelativeUrl(href)
    const { pathname: asPathname } = parseRelativeUrl(asPath)
    const route = normalizeRoute(hrefPathname)

    const getHrefForSlug = (path: string) => {
      const dataRoute = addLocale(getAssetPathFromRoute(path, '.json'), locale)
      return addBasePath(
        `/_next/data/${this.buildId}${dataRoute}${ssg ? '' : search}`
      )
    }

    const isDynamic: boolean = isDynamicRoute(route)
    const interpolatedRoute = isDynamic
      ? interpolateAs(hrefPathname, asPathname, query).result
      : ''

    return isDynamic
      ? interpolatedRoute && getHrefForSlug(interpolatedRoute)
      : getHrefForSlug(route)
  }

  /**
   * @param {string} href the route href (file-system path)
   */
  _isSsg(href: string): Promise<boolean> {
    const { pathname: hrefPathname } = parseRelativeUrl(href)
    const route = normalizeRoute(hrefPathname)
    return this.promisedSsgManifest!.then((s: ClientSsgManifest) =>
      s.has(route)
    )
  }

  loadPage(route: string): Promise<GoodPageCache> {
    route = normalizeRoute(route)

    return new Promise<GoodPageCache>((resolve, reject) => {
      // If there's a cached version of the page, let's use it.
      const cachedPage = this.pageCache[route]
      if (cachedPage) {
        if ('error' in cachedPage) {
          reject(cachedPage.error)
        } else {
          resolve(cachedPage)
        }
        return
      }

      const fire = (pageToCache: PageCacheEntry) => {
        this.pageRegisterEvents.off(route, fire)
        delete this.loadingRoutes[route]

        if ('error' in pageToCache) {
          reject(pageToCache.error)
        } else {
          resolve(pageToCache)
        }
      }

      // Register a listener to get the page
      this.pageRegisterEvents.on(route, fire)

      if (!this.loadingRoutes[route]) {
        this.loadingRoutes[route] = true
        if (process.env.NODE_ENV === 'production') {
          this.getDependencies(route)
            .then((deps) => {
              const pending: Promise<any>[] = []
              deps.forEach((d) => {
                if (
                  d.endsWith('.js') &&
                  !document.querySelector(`script[src^="${d}"]`)
                ) {
                  pending.push(loadScript(d))
                }
                if (d.endsWith('.css')) {
                  pending.push(this.fetchStyleSheet(d))
                }
              })
              return Promise.all(pending)
            })
            .catch((err) => {
              // Mark the page as failed to load if any of its required scripts
              // fail to load:
              this.pageCache[route] = { error: err }
              fire({ error: err })
            })
        } else {
          // Development only. In production the page file is part of the build manifest
          route = normalizeRoute(route)
          let scriptRoute = getAssetPathFromRoute(route, '.js')

          const url = `${this.assetPrefix}/_next/static/chunks/pages${encodeURI(
            scriptRoute
          )}`
          loadScript(url).catch((err) => {
            // Mark the page as failed to load if its script fails to load:
            this.pageCache[route] = { error: err }
            fire({ error: err })
          })
        }
      }
    })
  }

  // This method if called by the route code.
  registerPage(route: string, regFn: () => any) {
    const register = async (styleSheets: StyleSheetTuple[]) => {
      try {
        const mod = await regFn()
        const pageData: PageCacheEntry = {
          page: mod.default || mod,
          mod,
          styleSheets,
        }
        this.pageCache[route] = pageData
        this.pageRegisterEvents.emit(route, pageData)
      } catch (error) {
        this.pageCache[route] = { error }
        this.pageRegisterEvents.emit(route, { error })
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      // Wait for webpack to become idle if it's not.
      // More info: https://github.com/vercel/next.js/pull/1511
      if ((module as any).hot && (module as any).hot.status() !== 'idle') {
        console.log(
          `Waiting for webpack to become "idle" to initialize the page: "${route}"`
        )

        const check = (status: string) => {
          if (status === 'idle') {
            ;(module as any).hot.removeStatusHandler(check)
            register(
              /* css is handled via style-loader in development */
              []
            )
          }
        }
        ;(module as any).hot.status(check)
        return
      }
    }

    const isInitialLoad = route === this.initialPage
    const promisedDeps: Promise<StyleSheetTuple[]> =
      // Shared styles will already be on the page:
      route === '/_app' ||
      // We use `style-loader` in development:
      process.env.NODE_ENV !== 'production'
        ? Promise.resolve([])
        : // Tests that this does not block hydration:
          // test/integration/css-fixtures/hydrate-without-deps/
          (isInitialLoad
            ? Promise.resolve(
                looseToArray<HTMLLinkElement>(
                  document.querySelectorAll('link[data-n-p]')
                ).map((e) => e.getAttribute('href')!)
              )
            : this.getDependencies(route).then((deps) =>
                deps.filter((d) => d.endsWith('.css'))
              )
          ).then((cssFiles) =>
            // These files should've already been fetched by now, so this
            // should resolve instantly.
            Promise.all(cssFiles.map((d) => this.fetchStyleSheet(d))).catch(
              (err) => {
                if (isInitialLoad) {
                  Object.defineProperty(err, INITIAL_CSS_LOAD_ERROR, {})
                }
                throw err
              }
            )
          )
    promisedDeps.then(
      (deps) => register(deps),
      (error) => {
        this.pageCache[route] = { error }
        this.pageRegisterEvents.emit(route, { error })
      }
    )
  }

  /**
   * @param {string} route
   * @param {boolean} [isDependency]
   */
  prefetch(route: string, isDependency?: boolean): Promise<void> {
    // https://github.com/GoogleChromeLabs/quicklink/blob/453a661fa1fa940e2d2e044452398e38c67a98fb/src/index.mjs#L115-L118
    // License: Apache 2.0
    let cn
    if ((cn = (navigator as any).connection)) {
      // Don't prefetch if using 2G or if Save-Data is enabled.
      if (cn.saveData || /2g/.test(cn.effectiveType)) return Promise.resolve()
    }

    /** @type {string} */
    let url
    if (isDependency) {
      url = route
    } else {
      if (process.env.NODE_ENV !== 'production') {
        route = normalizeRoute(route)

        const ext =
          process.env.__NEXT_MODERN_BUILD && hasNoModule ? '.module.js' : '.js'
        const scriptRoute = getAssetPathFromRoute(route, ext)

        url = `${this.assetPrefix}/_next/static/${encodeURIComponent(
          this.buildId
        )}/pages${encodeURI(scriptRoute)}`
      }
    }

    return Promise.all([
      url
        ? url.endsWith('.css')
          ? this.fetchStyleSheet(url)
          : !document.querySelector(
              `link[rel="${relPrefetch}"][href^="${url}"]`
            ) && appendLink(url, relPrefetch, 'script')
        : 0,
      process.env.NODE_ENV === 'production' &&
        !isDependency &&
        this.getDependencies(route).then((urls) =>
          Promise.all(
            urls.map((dependencyUrl) => this.prefetch(dependencyUrl, true))
          )
        ),
    ]).then(
      // do not return any data
      () => {},
      // swallow prefetch errors
      () => {}
    )
  }
}
