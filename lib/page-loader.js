/* global window, document, __NEXT_DATA__ */
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
    route = route.replace(/index$/, '')

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
        this.pageRegisterEvents.off(route, fire)

        if (error) {
          reject(error)
        } else {
          resolve(page)
        }
      }

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

    if (__NEXT_DATA__.nextExport) {
      route = route === '/' ? '/index.js' : `${route}/index.js`
    }

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
      try {
        const { error, page } = regFn()
        this.pageCache[route] = { error, page }
        this.pageRegisterEvents.emit(route, { error, page })
      } catch (error) {
        this.pageCache[route] = { error }
        this.pageRegisterEvents.emit(route, { error })
      }
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

    const script = document.getElementById(`__NEXT_PAGE__${route}`)
    if (script) {
      script.parentNode.removeChild(script)
    }
  }
}
