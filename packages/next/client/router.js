/* global window */
import React from 'react'
import _Router from 'next-server/dist/lib/router/router'
import { RouterContext } from 'next-server/dist/lib/router-context'

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
const urlPropertyFields = ['pathname', 'route', 'query', 'asPath']
const propertyFields = ['components']
const routerEvents = ['routeChangeStart', 'beforeHistoryChange', 'routeChangeComplete', 'routeChangeError', 'hashChangeStart', 'hashChangeComplete']
const coreMethodFields = ['push', 'replace', 'reload', 'back', 'prefetch', 'beforePopState']

// Events is a static property on the router, the router doesn't have to be initialized to use it
Object.defineProperty(SingletonRouter, 'events', {
  get () {
    return _Router.events
  }
})

propertyFields.concat(urlPropertyFields).forEach((field) => {
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
    _Router.events.on(event, (...args) => {
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

// Reexport the withRoute HOC
export { default as withRouter } from './with-router'

export function useRouter () {
  return React.useContext(RouterContext)
}

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

// This function is used to create the `withRouter` router instance
export function makePublicRouterInstance (router) {
  const instance = {}

  for (const property of urlPropertyFields) {
    if (typeof router[property] === 'object') {
      instance[property] = { ...router[property] } // makes sure query is not stateful
      continue
    }

    instance[property] = router[property]
  }

  // Events is a static property on the router, the router doesn't have to be initialized to use it
  instance.events = _Router.events

  propertyFields.forEach((field) => {
    // Here we need to use Object.defineProperty because, we need to return
    // the property assigned to the actual router
    // The value might get changed as we change routes and this is the
    // proper way to access it
    Object.defineProperty(instance, field, {
      get () {
        return router[field]
      }
    })
  })

  coreMethodFields.forEach((field) => {
    instance[field] = (...args) => {
      return router[field](...args)
    }
  })

  return instance
}
