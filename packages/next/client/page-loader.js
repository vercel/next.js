import { parse } from 'url'
import mitt from '../next-server/lib/mitt'
import { isDynamicRoute } from './../next-server/lib/router/utils/is-dynamic'
import { getRouteMatcher } from './../next-server/lib/router/utils/route-matcher'
import { getRouteRegex } from './../next-server/lib/router/utils/route-regex'

function hasRel(rel, link) {
  try {
    link = document.createElement('link')
    return link.relList.supports(rel)
  } catch {}
}

const relPrefetch =
  hasRel('preload') && !hasRel('prefetch')
    ? // https://caniuse.com/#feat=link-rel-preload
      // macOS and iOS (Safari does not support prefetch)
      'preload'
    : // https://caniuse.com/#feat=link-rel-prefetch
      // IE 11, Edge 12+, nearly all evergreen
      'prefetch'

const hasNoModule = 'noModule' in document.createElement('script')

/** @param {string} route */
function normalizeRoute(route) {
  if (route[0] !== '/') {
    throw new Error(`Route name should start with a "/", got "${route}"`)
  }

  if (route === '/') return route
  return route.replace(/\/$/, '')
}

export function getAssetPath(route) {
  return route === '/'
    ? '/index'
    : /^\/index(\/|$)/.test(route)
    ? `/index${route}`
    : `${route}`
}

function appendLink(href, rel, as) {
  return new Promise((res, rej, link) => {
    link = document.createElement('link')
    link.crossOrigin = process.env.__NEXT_CROSS_ORIGIN
    link.href = href
    link.rel = rel
    if (as) link.as = as

    link.onload = res
    link.onerror = rej

    document.head.appendChild(link)
  })
}

export default class PageLoader {
  constructor(buildId, assetPrefix) {
    this.buildId = buildId
    this.assetPrefix = assetPrefix

    this.pageCache = {}
    this.pageRegisterEvents = mitt()
    this.loadingRoutes = {}
    if (process.env.NODE_ENV === 'production') {
      this.promisedBuildManifest = new Promise((resolve) => {
        if (window.__BUILD_MANIFEST) {
          resolve(window.__BUILD_MANIFEST)
        } else {
          window.__BUILD_MANIFEST_CB = () => {
            resolve(window.__BUILD_MANIFEST)
          }
        }
      })
    }
    /** @type {Promise<Set<string>>} */
    this.promisedSsgManifest = new Promise((resolve) => {
      if (window.__SSG_MANIFEST) {
        resolve(window.__SSG_MANIFEST)
      } else {
        window.__SSG_MANIFEST_CB = () => {
          resolve(window.__SSG_MANIFEST)
        }
      }
    })
  }

  // Returns a promise for the dependencies for a particular route
  getDependencies(route) {
    return this.promisedBuildManifest.then(
      (man) =>
        (man[route] &&
          man[route].map(
            (url) => `${this.assetPrefix}/_next/${encodeURI(url)}`
          )) ||
        []
    )
  }

  /**
   * @param {string} href the route href (file-system path)
   * @param {string} asPath the URL as shown in browser (virtual path); used for dynamic routes
   */
  getDataHref(href, asPath) {
    const getHrefForSlug = (/** @type string */ path) => {
      const dataRoute = getAssetPath(path)
      return `${this.assetPrefix}/_next/data/${this.buildId}${dataRoute}.json`
    }

    const { pathname: hrefPathname, query } = parse(href, true)
    const { pathname: asPathname } = parse(asPath)

    const route = normalizeRoute(hrefPathname)

    let isDynamic = isDynamicRoute(route),
      interpolatedRoute
    if (isDynamic) {
      const dynamicRegex = getRouteRegex(route)
      const dynamicGroups = dynamicRegex.groups
      const dynamicMatches =
        // Try to match the dynamic route against the asPath
        getRouteMatcher(dynamicRegex)(asPathname) ||
        // Fall back to reading the values from the href
        // TODO: should this take priority; also need to change in the router.
        query

      interpolatedRoute = route
      if (
        !Object.keys(dynamicGroups).every((param) => {
          let value = dynamicMatches[param]
          const repeat = dynamicGroups[param].repeat

          // support single-level catch-all
          // TODO: more robust handling for user-error (passing `/`)
          if (repeat && !Array.isArray(value)) value = [value]

          return (
            param in dynamicMatches &&
            // Interpolate group into data URL if present
            (interpolatedRoute = interpolatedRoute.replace(
              `[${repeat ? '...' : ''}${param}]`,
              repeat
                ? value.map(encodeURIComponent).join('/')
                : encodeURIComponent(value)
            ))
          )
        })
      ) {
        interpolatedRoute = '' // did not satisfy all requirements

        // n.b. We ignore this error because we handle warning for this case in
        // development in the `<Link>` component directly.
      }
    }

    return isDynamic
      ? interpolatedRoute && getHrefForSlug(interpolatedRoute)
      : getHrefForSlug(route)
  }

  /**
   * @param {string} href the route href (file-system path)
   * @param {string} asPath the URL as shown in browser (virtual path); used for dynamic routes
   */
  prefetchData(href, asPath) {
    const { pathname: hrefPathname } = parse(href, true)
    const route = normalizeRoute(hrefPathname)
    return this.promisedSsgManifest.then(
      (s, _dataHref) =>
        // Check if the route requires a data file
        s.has(route) &&
        // Try to generate data href, noop when falsy
        (_dataHref = this.getDataHref(href, asPath)) &&
        // noop when data has already been prefetched (dedupe)
        !document.querySelector(
          `link[rel="${relPrefetch}"][href^="${_dataHref}"]`
        ) &&
        // Inject the `<link rel=prefetch>` tag for above computed `href`.
        appendLink(_dataHref, relPrefetch, 'fetch')
    )
  }

  loadPage(route) {
    return this.loadPageScript(route)
  }

  loadPageScript(route) {
    route = normalizeRoute(route)

    return new Promise((resolve, reject) => {
      const fire = ({ error, page, mod }) => {
        this.pageRegisterEvents.off(route, fire)
        delete this.loadingRoutes[route]

        if (error) {
          reject(error)
        } else {
          resolve({ page, mod })
        }
      }

      // If there's a cached version of the page, let's use it.
      const cachedPage = this.pageCache[route]
      if (cachedPage) {
        const { error, page, mod } = cachedPage
        error ? reject(error) : resolve({ page, mod })
        return
      }

      // Register a listener to get the page
      this.pageRegisterEvents.on(route, fire)

      // If the page is loading via SSR, we need to wait for it
      // rather downloading it again.
      if (document.querySelector(`script[data-next-page="${route}"]`)) {
        return
      }

      if (!this.loadingRoutes[route]) {
        this.loadingRoutes[route] = true
        if (process.env.NODE_ENV === 'production') {
          this.getDependencies(route).then((deps) => {
            deps.forEach((d) => {
              if (
                /\.js$/.test(d) &&
                !document.querySelector(`script[src^="${d}"]`)
              ) {
                this.loadScript(d, route, false)
              }
              if (
                /\.css$/.test(d) &&
                !document.querySelector(`link[rel=stylesheet][href^="${d}"]`)
              ) {
                appendLink(d, 'stylesheet').catch(() => {
                  // FIXME: handle failure
                  // Right now, this is needed to prevent an unhandled rejection.
                })
              }
            })
            this.loadRoute(route)
          })
        } else {
          this.loadRoute(route)
        }
      }
    })
  }

  loadRoute(route) {
    route = normalizeRoute(route)
    let scriptRoute = getAssetPath(route)

    const url = `${this.assetPrefix}/_next/static/${encodeURIComponent(
      this.buildId
    )}/pages${encodeURI(scriptRoute)}.js`
    this.loadScript(url, route, true)
  }

  loadScript(url, route, isPage) {
    const script = document.createElement('script')
    if (process.env.__NEXT_MODERN_BUILD && hasNoModule) {
      script.type = 'module'
      // Only page bundle scripts need to have .module added to url,
      // dependencies already have it added during build manifest creation
      if (isPage) url = url.replace(/\.js$/, '.module.js')
    }
    script.crossOrigin = process.env.__NEXT_CROSS_ORIGIN
    script.src = url
    script.onerror = () => {
      const error = new Error(`Error loading script ${url}`)
      error.code = 'PAGE_LOAD_ERROR'
      this.pageRegisterEvents.emit(route, { error })
    }
    document.body.appendChild(script)
  }

  // This method if called by the route code.
  registerPage(route, regFn) {
    const register = () => {
      try {
        const mod = regFn()
        const pageData = { page: mod.default || mod, mod }
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
      if (module.hot && module.hot.status() !== 'idle') {
        console.log(
          `Waiting for webpack to become "idle" to initialize the page: "${route}"`
        )

        const check = (status) => {
          if (status === 'idle') {
            module.hot.removeStatusHandler(check)
            register()
          }
        }
        module.hot.status(check)
        return
      }
    }

    register()
  }

  /**
   * @param {string} route
   * @param {boolean} [isDependency]
   */
  prefetch(route, isDependency) {
    // https://github.com/GoogleChromeLabs/quicklink/blob/453a661fa1fa940e2d2e044452398e38c67a98fb/src/index.mjs#L115-L118
    // License: Apache 2.0
    let cn
    if ((cn = navigator.connection)) {
      // Don't prefetch if using 2G or if Save-Data is enabled.
      if (cn.saveData || /2g/.test(cn.effectiveType)) return Promise.resolve()
    }

    /** @type {string} */
    let url
    if (isDependency) {
      url = route
    } else {
      route = normalizeRoute(route)

      const scriptRoute = getAssetPath(route)
      const ext =
        process.env.__NEXT_MODERN_BUILD && hasNoModule ? '.module.js' : '.js'

      url = `${this.assetPrefix}/_next/static/${encodeURIComponent(
        this.buildId
      )}/pages${encodeURI(scriptRoute)}${ext}`
    }

    return Promise.all(
      document.querySelector(
        `link[rel="${relPrefetch}"][href^="${url}"], script[data-next-page="${route}"]`
      )
        ? []
        : [
            appendLink(
              url,
              relPrefetch,
              url.match(/\.css$/) ? 'style' : 'script'
            ),
            process.env.NODE_ENV === 'production' &&
              !isDependency &&
              this.getDependencies(route).then((urls) =>
                Promise.all(
                  urls.map((dependencyUrl) =>
                    this.prefetch(dependencyUrl, true)
                  )
                )
              ),
          ]
    ).then(
      // do not return any data
      () => {},
      // swallow prefetch errors
      () => {}
    )
  }
}
