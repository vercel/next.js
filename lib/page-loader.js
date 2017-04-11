/* global window, document */
const webpackModule = module

export default class PageLoader {
  constructor (buildId) {
    this.buildId = buildId
    this.pageCache = {}
    this.pageLoadedHandlers = {}
    this.loadingRoutes = {}
  }

  normalizeRoute (route) {
    if (route[0] !== '/') {
      throw new Error('Route name should start with a "/"')
    }

    if (route === '/') return route
    return route.replace(/(\/)?(index)?$/, '')
  }

  loadPage (route) {
    route = this.normalizeRoute(route)

    const cachedPage = this.pageCache[route]
    if (cachedPage) {
      return new Promise((resolve, reject) => {
        if (cachedPage.error) return reject(cachedPage.error)
        return resolve(cachedPage.page)
      })
    }

    if (this.loadingRoutes[route]) {
      return this.loadingRoutes[route]
    }

    const loadingPromise = new Promise((resolve, reject) => {
      this.loadScript(route, (error) => {
        delete this.loadingRoutes[route]

        if (error) return reject(error)

        const cachedPage = this.pageCache[route]
        if (cachedPage.error) return reject(cachedPage.error)
        return resolve(cachedPage.page)
      })
    })

    this.loadingRoutes[route] = loadingPromise
    return loadingPromise
  }

  loadScript (route, fn) {
    route = this.normalizeRoute(route)

    const script = document.createElement('script')
    const url = `/_next/${encodeURIComponent(this.buildId)}/page${route}`
    script.src = url
    script.type = 'text/javascript'

    script.onerror = (e) => {
      const error = new Error(`Network error occurred when loading route: ${route}`)
      fn(error)
    }

    script.onload = () => {
      fn()
    }

    document.body.appendChild(script)
  }

  // This method if called by the route code.
  registerPage (route, regFn) {
    route = this.normalizeRoute(route)

    const register = () => {
      // add the page to the cache
      const { error, page } = regFn()
      this.pageCache[route] = { error, page }
    }

    // Wait for webpack to became idle if it's not.
    // More info: https://github.com/zeit/next.js/pull/1511
    if (webpackModule && webpackModule.hot && webpackModule.hot.status() !== 'idle') {
      console.log(`Waiting webpack to became "idle" to initialize the page: "${route}"`)

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

  clearCache (route) {
    route = this.normalizeRoute(route)
    delete this.pageCache[route]
    delete this.loadingRoutes[route]
  }
}
