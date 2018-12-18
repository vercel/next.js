/* global window */
import _Router from './router'

const SingletonRouter = {
  router: null // holds the actual router instance
}

// Create public properties and methods of the router in the SingletonRouter
const propertyFields = ['components', 'pathname', 'route', 'query', 'asPath']
const coreMethodFields = ['push', 'replace']
const routerEvents = ['routeChangeStart', 'routeChangeComplete']

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

  routerEvents.forEach((event) => {
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

  return SingletonRouter.router
}

// Export the actual Router class, which is usually used inside the server
export const Router = _Router
