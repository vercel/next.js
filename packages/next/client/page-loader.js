/* global document, window */
import mitt from '../next-server/lib/mitt'

function supportsPreload (el) {
  try {
    return el.relList.supports('preload')
  } catch {
    return false
  }
}

const hasPreload = supportsPreload(document.createElement('link'))

function preloadScript (url) {
  const link = document.createElement('link')
  link.rel = 'preload'
  link.crossOrigin = process.crossOrigin
  link.href = encodeURI(url)
  link.as = 'script'
  document.head.appendChild(link)
}

export default class PageLoader {
  constructor (buildId, assetPrefix) {
    this.buildId = buildId
    this.assetPrefix = assetPrefix

    this.pageCache = {}
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
  getDependencies (route) {
    return this.promisedBuildManifest.then(
      man => (man[route] && man[route].map(url => `/_next/${url}`)) || []
    )
  }

  normalizeRoute (route) {
    if (route[0] !== '/') {
      throw new Error(`Route name should start with a "/", got "${route}"`)
    }
    route = route.replace(/\/index$/, '/')

    if (route === '/') return route
    return route.replace(/\/$/, '')
  }

  loadPage (route) {
    return this.loadPageScript(route).then(v => v.page)
  }

  loadPageScript (route) {
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
              if (/\.js$/.test(d) && !document.querySelector(`script[src^="${d}"]`)) {
                this.loadScript(d, route, false)
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

  async loadRoute (route) {
    route = this.normalizeRoute(route)
    let scriptRoute = route === '/' ? '/index.js' : `${route}.js`

    const url = `${this.assetPrefix}/_next/static/${encodeURIComponent(
      this.buildId
    )}/pages${scriptRoute}`
    this.loadScript(url, route, true)
  }

  loadScript (url, route, isPage) {
    const script = document.createElement('script')
    if (process.env.__NEXT_MODERN_BUILD && 'noModule' in script) {
      script.type = 'module'
      // Only page bundle scripts need to have .module added to url,
      // dependencies already have it added during build manifest creation
      if (isPage) url = url.replace(/\.js$/, '.module.js')
    }
    script.crossOrigin = process.crossOrigin
    script.src = encodeURI(url)
    script.onerror = () => {
      const error = new Error(`Error loading script ${url}`)
      error.code = 'PAGE_LOAD_ERROR'
      this.pageRegisterEvents.emit(route, { error })
    }
    document.body.appendChild(script)
  }

  // This method if called by the route code.
  registerPage (route, regFn) {
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

  async prefetch (route, isDependency) {
    route = this.normalizeRoute(route)
    let scriptRoute = `${route === '/' ? '/index' : route}.js`

    if (
      process.env.__NEXT_MODERN_BUILD &&
      'noModule' in document.createElement('script')
    ) {
      scriptRoute = scriptRoute.replace(/\.js$/, '.module.js')
    }
    const url =
      this.assetPrefix +
      (isDependency
        ? route
        : `/_next/static/${encodeURIComponent(
          this.buildId
        )}/pages${scriptRoute}`)

    // n.b. If preload is not supported, we fall back to `loadPage` which has
    // its own deduping mechanism.
    if (
      document.querySelector(
        `link[rel="preload"][href^="${url}"], script[data-next-page="${route}"]`
      )
    ) {
      return
    }

    // Inspired by quicklink, license: https://github.com/GoogleChromeLabs/quicklink/blob/master/LICENSE
    let cn
    if ((cn = navigator.connection)) {
      // Don't prefetch if the user is on 2G or if Save-Data is enabled.
      if ((cn.effectiveType || '').indexOf('2g') !== -1 || cn.saveData) {
        return
      }
    }

    if (process.env.__NEXT_GRANULAR_CHUNKS && !isDependency) {
      ;(await this.getDependencies(route)).forEach(url => {
        this.prefetch(url, true)
      })
    }

    // Feature detection is used to see if preload is supported
    // If not fall back to loading script tags before the page is loaded
    // https://caniuse.com/#feat=link-rel-preload
    if (hasPreload) {
      preloadScript(url)
      return
    }

    if (isDependency) {
      // loadPage will automatically handle depencies, so no need to
      // preload them manually
      return
    }

    if (document.readyState === 'complete') {
      return this.loadPage(route).catch(() => {})
    } else {
      return new Promise(resolve => {
        window.addEventListener('load', () => {
          this.loadPage(route).then(() => resolve(), () => resolve())
        })
      })
    }
  }
}
