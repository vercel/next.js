import mitt from '../next-server/lib/mitt'

function hasPrefetch(link) {
  try {
    link = document.createElement('link')
    return link.relList.supports('prefetch')
  } catch {}
}

const relPrefetch = hasPrefetch()
  ? // https://caniuse.com/#feat=link-rel-prefetch
    // IE 11, Edge 12+, nearly all evergreen
    'prefetch'
  : // https://caniuse.com/#feat=link-rel-preload
    // macOS and iOS (Safari does not support prefetch)
    'preload'

const hasNoModule = 'noModule' in document.createElement('script')

function appendLink(href, rel, as) {
  return new Promise((res, rej, link) => {
    link = document.createElement('link')
    link.crossOrigin = process.crossOrigin
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
    this.prefetched = {}
    this.pageRegisterEvents = mitt()
    this.loadingRoutes = {}
    if (process.env.__NEXT_GRANULAR_CHUNKS) {
      this.promisedBuildManifest = new Promise(resolve => {
        if (window.__BUILD_MANIFEST) {
          resolve(window.__BUILD_MANIFEST)
        } else {
          window.__BUILD_MANIFEST_CB = () => {
            resolve(window.__BUILD_MANIFEST)
          }
        }
      })
    }
  }

  // Returns a promise for the dependencies for a particular route
  getDependencies(route) {
    return this.promisedBuildManifest.then(
      man =>
        (man[route] && man[route].map(url => `/_next/${encodeURI(url)}`)) || []
    )
  }

  normalizeRoute(route) {
    if (route[0] !== '/') {
      throw new Error(`Route name should start with a "/", got "${route}"`)
    }
    route = route.replace(/\/index$/, '/')

    if (route === '/') return route
    return route.replace(/\/$/, '')
  }

  loadPage(route) {
    return this.loadPageScript(route).then(v => v.page)
  }

  loadPageScript(route) {
    route = this.normalizeRoute(route)

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
        if (process.env.__NEXT_GRANULAR_CHUNKS) {
          this.getDependencies(route).then(deps => {
            deps.forEach(d => {
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
            this.loadingRoutes[route] = true
          })
        } else {
          this.loadRoute(route)
          this.loadingRoutes[route] = true
        }
      }
    })
  }

  async loadRoute(route) {
    route = this.normalizeRoute(route)
    let scriptRoute = route === '/' ? '/index.js' : `${route}.js`

    const url = `${this.assetPrefix}/_next/static/${encodeURIComponent(
      this.buildId
    )}/pages${encodeURI(scriptRoute)}`
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
    script.crossOrigin = process.crossOrigin
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
      // More info: https://github.com/zeit/next.js/pull/1511
      if (module.hot && module.hot.status() !== 'idle') {
        console.log(
          `Waiting for webpack to become "idle" to initialize the page: "${route}"`
        )

        const check = status => {
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

  async prefetch(route, isDependency) {
    // https://github.com/GoogleChromeLabs/quicklink/blob/453a661fa1fa940e2d2e044452398e38c67a98fb/src/index.mjs#L115-L118
    // License: Apache 2.0
    let cn
    if ((cn = navigator.connection)) {
      // Don't prefetch if using 2G or if Save-Data is enabled.
      if (cn.saveData || /2g/.test(cn.effectiveType)) return
    }

    let url = this.assetPrefix
    if (isDependency) {
      url += route
    } else {
      route = this.normalizeRoute(route)
      this.prefetched[route] = true

      let scriptRoute = `${route === '/' ? '/index' : route}.js`
      if (process.env.__NEXT_MODERN_BUILD && hasNoModule) {
        scriptRoute = scriptRoute.replace(/\.js$/, '.module.js')
      }

      url += `/_next/static/${encodeURIComponent(
        this.buildId
      )}/pages${encodeURI(scriptRoute)}`
    }

    if (
      document.querySelector(
        `link[rel="${relPrefetch}"][href^="${url}"], script[data-next-page="${route}"]`
      )
    ) {
      return
    }

    return Promise.all([
      appendLink(url, relPrefetch, url.match(/\.css$/) ? 'style' : 'script'),
      process.env.__NEXT_GRANULAR_CHUNKS &&
        !isDependency &&
        this.getDependencies(route).then(urls =>
          Promise.all(urls.map(url => this.prefetch(url, true)))
        ),
    ]).then(
      // do not return any data
      () => {},
      // swallow prefetch errors
      () => {}
    )
  }
}
