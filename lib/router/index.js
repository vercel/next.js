/* global window */
import _Router from './router'

const SingletonRouter = {
  router: null, // holds the actual router instance
  readyCallbacks: [],
  ready (cb) {
    if (this.router) return cb()
    if (typeof window !== 'undefined') {
      this.readyCallbacks.push(cb)
    }
  }
}

// Create public properties and methods of the router in the SingletonRouter
const propertyFields = ['components', 'pathname', 'route', 'query', 'asPath']
const coreMethodFields = ['push', 'replace', 'reload', 'back', 'prefetch']
const routerEvents = ['routeChangeStart', 'beforeHistoryChange', 'routeChangeComplete', 'routeChangeError']

propertyFields.forEach((field) => {
  // Here we need to use Object.defineProperty because, we need to return
  // the property assigned to the actual router
  // The value might get changed as we change routes and this is the
  // proper way to access it
  Object.defineProperty(SingletonRouter, field, {
    get () {
      throwIfNoRouter()
      return SingletonRouter.router[field]
    }
  })
})

coreMethodFields.forEach((field) => {
  SingletonRouter[field] = (...args) => {
    throwIfNoRouter()
    return SingletonRouter.router[field](...args)
  }
})

routerEvents.forEach((event) => {
  SingletonRouter.ready(() => {
    SingletonRouter.router.events.on(event, (...args) => {
      const eventField = `on${event.charAt(0).toUpperCase()}${event.substring(1)}`
      if (SingletonRouter[eventField]) {
        try {
          SingletonRouter[eventField](...args)
        } catch (err) {
          console.error(`Error when running the Router event: ${eventField}`)
          console.error(`${err.message}\n${err.stack}`)
        }
      }
    })
  })
})

function throwIfNoRouter () {
  if (!SingletonRouter.router) {
    const message = 'No router instance found.\n' +
      'You should only use "next/router" inside the client side of your app.\n'
    throw new Error(message)
  }
}

// Export the SingletonRouter and this is the public API.
export default SingletonRouter

// INTERNAL APIS
// -------------
// (do not use following exports inside the app)

// Create a router and assign it as the singleton instance.
// This is used in client side when we are initilizing the app.
// This should **not** use inside the server.
export const createRouter = function (...args) {
  SingletonRouter.router = new _Router(...args)
  SingletonRouter.readyCallbacks.forEach(cb => cb())
  SingletonRouter.readyCallbacks = []

  return SingletonRouter.router
}

// Export the actual Router class, which is usually used inside the server
export const Router = _Router

export function _notifyBuildIdMismatch (nextRoute) {
  if (SingletonRouter.onAppUpdated) {
    SingletonRouter.onAppUpdated(nextRoute)
  } else {
    console.warn(`An app update detected. Loading the SSR version of "${nextRoute}"`)
    window.location.href = nextRoute
  }
}

export function _rewriteUrlForNextExport (url) {
  const [, hash] = url.split('#')
  url = url.replace(/#.*/, '')

  let [path, qs] = url.split('?')
  path = path.replace(/\/$/, '')

  let newPath = `${path}/`
  if (qs) {
    newPath = `${newPath}?${qs}`
  }

  if (hash) {
    newPath = `${newPath}#${hash}`
  }

  return newPath
}
