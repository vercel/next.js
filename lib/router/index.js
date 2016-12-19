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
      return router[field]
    }
  })
})

methodFields.forEach((field) => {
  SingletonRouter[field] = (...args) => {
    return router[field](...args)
  }
})

// This is an internal method and it should not be called directly.
//
// ## Client Side Usage
// We create the router in the client side only for a single time when we are
// booting the app. It happens before rendering any components.
// At the time of the component rendering, there'll be a router instance
//
// ## Server Side Usage
// We create router for every SSR page render.
// Since rendering happens in the same eventloop this works properly.
export const createRouter = function (...args) {
  router = new _Router(...args)
  return router
}

// Export the actual Router class, which is also use internally
// You'll ever need to access this directly
export const Router = _Router

// Export the SingletonRouter and this is the public API.
// This is an client side API and doesn't available on the server
export default SingletonRouter
