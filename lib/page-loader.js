/* global window, document */
import EventEmitter from './EventEmitter'

const pageCache = {}
const pageRegisterEvents = new EventEmitter()

export function waitForPage (route) {
  route = normalizeRoute(route)

  return new Promise((resolve, reject) => {
    const fire = ({ error, page }) => {
      pageRegisterEvents.off(route, fire)

      if (error) {
        reject(error)
      } else {
        resolve(page)
      }
    }

    // If there's a cached version of the page, let's use it.
    const cachedPage = pageCache[route]
    if (cachedPage) {
      const { error, page } = cachedPage
      error ? reject(error) : resolve(page)
      return
    }

    // Register a listener to get the page
    pageRegisterEvents.on(route, fire)
  })
}

// This method if called by the route code.
export function registerPage (route, regFn) {
  const register = () => {
    try {
      const { error, page } = regFn()
      pageCache[route] = { error, page }
      pageRegisterEvents.emit(route, { error, page })
    } catch (error) {
      pageCache[route] = { error }
      pageRegisterEvents.emit(route, { error })
    }
  }

  // Wait for webpack to become idle if it's not.
  // More info: https://github.com/zeit/next.js/pull/1511
  if (module.hot && module.hot.status() !== 'idle') {
    console.log(`Waiting for webpack to become "idle" to initialize the page: "${route}"`)

    const check = (status) => {
      if (status === 'idle') {
        module.hot.removeStatusHandler(check)
        register()
      }
    }
    module.hot.status(check)
  } else {
    register()
  }
}

function normalizeRoute (route) {
  if (process.env.NODE_ENV !== 'production' && route[0] !== '/') {
    throw new Error(`Route name should start with a "/", got "${route}"`)
  }
  route = route.replace(/\/index$/, '/')

  if (route === '/') return route
  return route.replace(/\/$/, '')
}
