/* global document */
import EventEmitter from 'next-server/dist/lib/EventEmitter'

// smaller version of https://gist.github.com/igrigorik/a02f2359f3bc50ca7a9c
function listSupports (list, token) {
  if (!list || !list.supports) {
    return false
  }
  try {
    return list.supports(token)
  } catch (e) {
    return false
  }
}

const supportsPrefetch = listSupports(document.createElement('link').relList, 'prefetch')
const webpackModule = module

export default class PageLoader {
  constructor (buildId, assetPrefix) {
    this.buildId = buildId
    this.assetPrefix = assetPrefix

    this.pageCache = {}
    this.prefetchCache = new Set()
    this.pageRegisterEvents = new EventEmitter()
    this.loadingRoutes = {}
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
    route = this.normalizeRoute(route)

    return new Promise((resolve, reject) => {
      const fire = ({ error, page }) => {
        this.pageRegisterEvents.off(route, fire)
        delete this.loadingRoutes[route]

        if (error) {
          reject(error)
        } else {
          resolve(page)
        }
      }

      // If there's a cached version of the page, let's use it.
      const cachedPage = this.pageCache[route]
      if (cachedPage) {
        const { error, page } = cachedPage
        error ? reject(error) : resolve(page)
        return
      }

      // Register a listener to get the page
      this.pageRegisterEvents.on(route, fire)

      // If the page is loading via SSR, we need to wait for it
      // rather downloading it again.
      if (document.getElementById(`__NEXT_PAGE__${route}`)) {
        return
      }

      // Load the script if not asked to load yet.
      if (!this.loadingRoutes[route]) {
        this.loadScript(route)
        this.loadingRoutes[route] = true
      }
    })
  }

  loadScript (route) {
    route = this.normalizeRoute(route)
    const scriptRoute = route === '/' ? '/index.js' : `${route}.js`

    const script = document.createElement('script')
    const url = `${this.assetPrefix}/_next/static/${encodeURIComponent(this.buildId)}/pages${scriptRoute}`
    script.src = url
    script.onerror = () => {
      const error = new Error(`Error when loading route: ${route}`)
      error.code = 'PAGE_LOAD_ERROR'
      this.pageRegisterEvents.emit(route, { error })
    }

    document.body.appendChild(script)
  }

  // This method if called by the route code.
  registerPage (route, regFn) {
    const register = () => {
      try {
        const { error, page } = regFn()
        this.pageCache[route] = { error, page }
        this.pageRegisterEvents.emit(route, { error, page })
      } catch (error) {
        this.pageCache[route] = { error }
        this.pageRegisterEvents.emit(route, { error })
      }
    }

    // Wait for webpack to become idle if it's not.
    // More info: https://github.com/zeit/next.js/pull/1511
    if (webpackModule && webpackModule.hot && webpackModule.hot.status() !== 'idle') {
      console.log(`Waiting for webpack to become "idle" to initialize the page: "${route}"`)

      const check = (status) => {
        if (status === 'idle') {
          webpackModule.hot.removeStatusHandler(check)
          register()
        }
      }
      webpackModule.hot.status(check)
    } else {
      register()
    }
  }

  async prefetch (route) {
    route = this.normalizeRoute(route)
    const scriptRoute = route === '/' ? '/index.js' : `${route}.js`
    if (this.prefetchCache.has(scriptRoute)) {
      return
    }
    this.prefetchCache.add(scriptRoute)

    const link = document.createElement('link')
    // Feature detection is used to see if prefetch is supported, else fall back to preload
    // Mainly this is for Safari
    // https://caniuse.com/#feat=link-rel-prefetch
    // https://caniuse.com/#feat=link-rel-preload
    link.rel = supportsPrefetch ? 'prefetch' : 'preload'
    link.href = `${this.assetPrefix}/_next/static/${encodeURIComponent(this.buildId)}/pages${scriptRoute}`
    link.as = 'script'
    document.head.appendChild(link)
  }

  clearCache (route) {
    route = this.normalizeRoute(route)
    delete this.pageCache[route]
    delete this.loadingRoutes[route]
    delete this.loadingRoutes[route]

    const script = document.getElementById(`__NEXT_PAGE__${route}`)
    if (script) {
      script.parentNode.removeChild(script)
    }
  }
}
