/* global window, document */
import mitt from 'mitt'

const webpackModule = module

export default class PageLoader {
  constructor (buildId, assetPrefix) {
    this.buildId = buildId
    this.assetPrefix = assetPrefix

    this.pageCache = {}
    this.pageLoadedHandlers = {}
    this.pageRegisterEvents = mitt()
    this.loadingRoutes = {}

    this.chunkRegisterEvents = mitt()
    this.loadedChunks = {}
  }

  normalizeRoute (route) {
    if (route[0] !== '/') {
      throw new Error('Route name should start with a "/"')
    }

    return route.replace(/index$/, '')
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
        this.pageRegisterEvents.off(route, fire)

        if (error) {
          reject(error)
        } else {
          resolve(page)
        }
      }

      this.pageRegisterEvents.on(route, fire)

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
      this.pageRegisterEvents.emit(route, { error })
    }

    document.body.appendChild(script)
  }

  // This method if called by the route code.
  registerPage (route, regFn) {
    const register = () => {
      const { error, page } = regFn()
      this.pageCache[route] = { error, page }
      this.pageRegisterEvents.emit(route, { error, page })
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

  registerChunk (chunkName, regFn) {
    const chunk = regFn()
    this.loadedChunks[chunkName] = true
    this.chunkRegisterEvents.emit(chunkName, chunk)
  }

  waitForChunk (chunkName, regFn) {
    const loadedChunk = this.loadedChunks[chunkName]
    if (loadedChunk) {
      return Promise.resolve(true)
    }

    return new Promise((resolve) => {
      const register = (chunk) => {
        this.chunkRegisterEvents.off(chunkName, register)
        resolve(chunk)
      }

      this.chunkRegisterEvents.on(chunkName, register)
    })
  }

  clearCache (route) {
    route = this.normalizeRoute(route)
    delete this.pageCache[route]
    delete this.loadingRoutes[route]
  }
}
