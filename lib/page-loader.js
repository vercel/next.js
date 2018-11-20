/* global window, document, __webpack_public_path__ */
import EventEmitter from './EventEmitter'

const pageCache = {}
const pageRegisterEvents = new EventEmitter()
const loadingRoutes = {}

export function loadPage (route) {
  route = normalizeRoute(route)

  return new Promise((resolve, reject) => {
    const fire = ({ error, page }) => {
      pageRegisterEvents.off(route, fire)
      delete loadingRoutes[route]

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

    // If the page is loading via SSR, we need to wait for it
    // rather downloading it again.
    if (document.getElementById(`__NEXT_PAGE__${route}`) || route === '/_error') {
      return
    }

    // Load the script if not asked to load yet.
    if (!loadingRoutes[route]) {
      loadScript(route)
      loadingRoutes[route] = true
    }
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

export function clearCache (route) {
  route = normalizeRoute(route)
  delete pageCache[route]
  delete loadingRoutes[route]

  const script = document.getElementById(`__NEXT_PAGE__${route}`)
  if (script) {
    script.parentNode.removeChild(script)
  }
}

function loadScript (route) {
  route = normalizeRoute(route)
  route = route === '/' ? '/index' : route

  const script = document.createElement('script')
  // eslint-disable-next-line camelcase
  const url = `${__webpack_public_path__}/pages${route}.js`
  script.src = url
  script.type = 'text/javascript'
  script.onerror = () => {
    const error = new Error(`Error when loading route: ${route}`)
    pageRegisterEvents.emit(route, { error })
  }

  document.body.appendChild(script)
}

function normalizeRoute (route) {
  if (route[0] !== '/') {
    throw new Error(`Route name should start with a "/", got "${route}"`)
  }
  route = route.replace(/\/index$/, '/')

  if (route === '/') return route
  return route.replace(/\/$/, '')
}
