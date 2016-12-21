import _Router from './router'

// holds the actual router instance
let router = null

const SingletonRouter = {}

// Create public properties and methods of the router in the SingletonRouter
const propertyFields = ['components', 'pathname', 'route', 'query']
const methodFields = ['push', 'replace', 'reload', 'back']

propertyFields.forEach((field) => {
  // Here we need to use Object.defineProperty because, we need to return
  // the property assigned to the actual router
  // The value might get changed as we change routes and this is the
  // proper way to access it
  Object.defineProperty(SingletonRouter, field, {
    get () {
      throwIfNoRouter()
      return router[field]
    }
  })
})

methodFields.forEach((field) => {
  SingletonRouter[field] = (...args) => {
    throwIfNoRouter()
    return router[field](...args)
  }
})

function throwIfNoRouter () {
  if (!router) {
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
  router = new _Router(...args)
  return router
}

// Export the actual Router class, which is usually used inside the server
export const Router = _Router
