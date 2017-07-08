/* global window, document */
import mitt from 'mitt'

const webpackModule = module

export default class PageLoader {
  constructor (buildId, assetPrefix) {
    this.buildId = buildId
    this.assetPrefix = assetPrefix

    this.pageCache = {}
    this.pageLoadedHandlers = {}
    this.registerEvents = mitt()
    this.loadingRoutes = {}
  }

  normalizeRoute (route) {
    if (route[0] !== '/') {
      throw new Error('Route name should start with a "/"')
    }
    route = route.replace(/\/index$/, '/')

    if (route === '/') return route
    return route.replace(/\/$/, '')
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

    return new Promise((resolve, reject) => {
      const fire = ({ error, page }) => {
        this.registerEvents.off(route, fire)

        if (error) {
          reject(error)
        } else {
          resolve(page)
        }
      }

      this.registerEvents.on(route, fire)

      // Load the script if not asked to load yet.
      if (!this.loadingRoutes[route]) {
        this.loadScript(route)
        this.loadingRoutes[route] = true
      }
    })
  }

  loadScript (route) {
    route = this.normalizeRoute(route)

    const script = document.createElement('script')
    const url = `${this.assetPrefix}/_next/${encodeURIComponent(this.buildId)}/page${route}`
    script.src = url
    script.type = 'text/javascript'
    script.onerror = () => {
      const error = new Error(`Error when loading route: ${route}`)
      this.registerEvents.emit(route, { error })
    }

    document.body.appendChild(script)
  }

  // This method if called by the route code.
  registerPage (route, regFn) {
    const register = () => {
      const { error, page } = regFn()
      this.pageCache[route] = { error, page }
      this.registerEvents.emit(route, { error, page })
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
