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

  // Assign the router to the SingletonRouter object
  for (const name of router) {
    const property = router[name]
    if (typeof property === 'function') {
      SingletonRouter[name] = router[name].bind(router)
    } else {
      Object.defineProperty(SingletonRouter, name, {
        get () {
          return router[name]
        }
      })
    }
  }

  return router
}

// Export the actual Router class, which is also use internally
// You'll ever need to access this directly
export const Router = _Router

// Export the SingletonRouter and this is the public API.
// This is an client side API and doesn't available on the server
export default SingletonRouter
