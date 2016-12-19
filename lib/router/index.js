import _Router from './router'

// holds the actual router instance
let router = null

const SingletonRouter = {}

// this is an internal method and should not be called directly.
export const createRouter = function (...args) {
  if (router) {
    throw new Error('Router is already created!')
  }

  router = new _Router(...args)

  // Move public properties and method from the actual router
  // instance to the SingletonRouter
  const propertyFields = ['route', 'components', 'pathname', 'query']
  const methodFields = ['push', 'replace', 'reload', 'back']

  propertyFields.forEach((field) => {
    // Here we need to use Object.defineProperty because, we need to return
    // the property assigned to the actual router
    // The value might get changed as we change routes and this is the
    // proper way to access it
    Object.defineProperty(SingletonRouter, field, {
      get () {
        return router[field]
      }
    })
  })

  methodFields.forEach((field) => {
    SingletonRouter[field] = router[field].bind(router)
  })

  return router
}

// Export the actual Router class, which is also use internally
// You'll ever need to access this directly
export const Router = _Router

// Export the SingletonRouter and this is the public API.
// This is an client side API and doesn't available on the server
export default SingletonRouter
