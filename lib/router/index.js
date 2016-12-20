import _Router from './router'

// holds the actual router instance
let router = null

const SingletonRouter = {}

// Create public properties and methods of the router in the SingletonRouter
const propertyFields = ['route', 'components', 'pathname', 'query']
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
      'If you are using "next/router" inside "getInitialProps", avoid it.\n'
    throw new Error(message)
  }
}

// Export the SingletonRouter and this is the public API.
// This is an client side API and doesn't available on the server
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

// This helper is used to assign a router instance only when running the "cb"
// This is useful for assigning a router instance when we do SSR.
export const withRouter = function (r, cb) {
  const original = router
  router = r
  const result = cb()

  router = original
  return result
}

// Export the actual Router class, which is also use internally
// You'll ever need to access this directly
export const Router = _Router
