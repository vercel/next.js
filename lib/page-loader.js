/* global window, document */
/**
 * The PageLoader is responsible for managing the state of loaded page bundles
 * It adds the page bundles to the DOM, caches the components and emits events for
 * other parts of Next.JS to react to
 */
export default class PageLoader {
  constructor (nextData) {
    this.nextData = nextData
    this.pageCache = cache
    this.pageLoadedHandlers = {}
  }

  getPageForRoute (route) {
    return this.pageCache[route]
  }

  has (route) {
    return !!this.pageCache[route]
  }

  /**
   * add a page to the cache with a
   * specific bundle key e.g /bundles/pages/_error.js etc.
   */
  registerPage (bundleKey, Page) {
    // add the page to the cache
    this.pageCache[`/${bundleKey}`] = Page
    // notify any handlers
    const handlers = this.pageLoadedHandlers[`/${bundleKey}`]
    if (handlers && handlers.length) {
      handlers.forEach(handler => handler(Page))
    }
  }

  /**
   * Mount a page bundle to the DOM
   */
  mountPageBundle (route) {
    const { buildId } = this.nextData
    const body = document.body
    if (isScriptLoaded(buildId, route)) {
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      const script = scriptFor(buildId, route)

      script.onerror = () => {
        reject(new Error(`Error mounting ${route} bundle`))
      }

      script.onload = () => {
        resolve()
      }

      // append the script to the body
      body.appendChild(script)
    })
  }

  onPageLoaded (pathname, cb) {
    if (!this.pageLoadedHandlers[pathname]) {
      this.pageLoadedHandlers[pathname] = []
    }
    this.pageLoadedHandlers[pathname].push(cb)

    return () => {
      // remove handler from set
      this.pageLoadedHandlers[pathname] = this.pageLoadedHandlers[pathname].filter(handler => handler !== cb)
    }
  }
}

/**
 * The singleton cache for the pages
 */
export const cache = {}

/**
 * Check if a script has already been loaded
 */
const isScriptLoaded = (buildId, route) => {
  const existing = document.getElementById(`${buildId}_${route}`)
  return !!existing
}

/**
 * Create a script element for a given buildId and page route
 */
const scriptFor = (buildId, route) => {
  const script = document.createElement('script')
  const url = `/_next/${encodeURIComponent(buildId)}/pages${route}`
  script.id = `${buildId}_${route}`
  script.src = url
  script.type = 'text/javascript'
  return script
}
