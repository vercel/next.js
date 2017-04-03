/* global window, document */
import mitt from 'mitt'

export default class PageLoader {
  constructor (buildId) {
    this.buildId = buildId
    this.pageCache = {}
    this.pageLoadedHandlers = {}
    this.registerEvents = mitt()
    this.loadingRoutes = {}
  }

  loadPage (route) {
    if (route[0] !== '/') {
      throw new Error('Route name should start with a "/"')
    }

    route = route.replace(/index$/, '')

    if (this.pageCache[route]) {
      return Promise.resolve(this.pageCache[route])
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
    const script = document.createElement('script')
    const url = `/_next/${encodeURIComponent(this.buildId)}/page${route}`
    script.src = url
    script.type = 'text/javascript'
    script.onerror = () => {
      const error = new Error(`Error when loading route: ${route}`)
      this.registerEvents.emit(route, { error })
    }

    document.body.appendChild(script)
  }

  // This method if called by the route code.
  registerPage (route, error, page) {
    // add the page to the cache
    this.pageCache[route] = page
    this.registerEvents.emit(route, { error, page })
  }
}
