/* global window */
import React from 'react'
import Router, { IRouterInterface } from 'next-server/dist/lib/router/router'
import { RouterContext } from 'next-server/dist/lib/router-context'
import { RequestContext } from 'next-server/dist/lib/request-context'

type ClassArguments<T> = T extends new(...args: infer U) => any ? U : any

type RouterArgs = ClassArguments<typeof Router>

interface ISingletonRouterBase {
  router: Router | null
  readyCallbacks: Array<() => any>
  ready(cb: () => any): void
}

export interface IPublicRouterInstance extends IRouterInterface, Pick<Router, | 'components' | 'push' | 'replace' | 'reload' | 'back' | 'prefetch' | 'beforePopState'> {
  events: typeof Router['events']
}

export interface ISingletonRouter extends ISingletonRouterBase, IPublicRouterInstance {}

const SingletonRouter: ISingletonRouterBase = {
  router: null, // holds the actual router instance
  readyCallbacks: [],
  ready(cb: () => void) {
    if (this.router) return cb()
    if (typeof window !== 'undefined') {
      this.readyCallbacks.push(cb)
    }
  },
}

// const x = SingletonRouter as IRealRouter

// Create public properties and methods of the router in the SingletonRouter
const urlPropertyFields = ['pathname', 'route', 'query', 'asPath']
const propertyFields = ['components']
const routerEvents = ['routeChangeStart', 'beforeHistoryChange', 'routeChangeComplete', 'routeChangeError', 'hashChangeStart', 'hashChangeComplete']
const coreMethodFields = ['push', 'replace', 'reload', 'back', 'prefetch', 'beforePopState']

// Events is a static property on the router, the router doesn't have to be initialized to use it
Object.defineProperty(SingletonRouter, 'events', {
  get() {
    return Router.events
  },
})

propertyFields.concat(urlPropertyFields).forEach((field) => {
  // Here we need to use Object.defineProperty because, we need to return
  // the property assigned to the actual router
  // The value might get changed as we change routes and this is the
  // proper way to access it
  Object.defineProperty(SingletonRouter, field, {
    get() {
      const router = getRouter() as any
      return router[field] as string
    },
  })
})

coreMethodFields.forEach((field) => {
  // We don't really know the types here, so we add them later instead
  (SingletonRouter as any)[field] = (...args: any[]) => {
    const router = getRouter() as any
    return router[field](...args)
  }
})

routerEvents.forEach((event) => {
  SingletonRouter.ready(() => {
    Router.events.on(event, (...args) => {
      const eventField = `on${event.charAt(0).toUpperCase()}${event.substring(1)}`
      const singletonRouter = SingletonRouter as any
      if (singletonRouter[eventField]) {
        try {
          singletonRouter[eventField](...args)
        } catch (err) {
          // tslint:disable-next-line:no-console
          console.error(`Error when running the Router event: ${eventField}`)
          // tslint:disable-next-line:no-console
          console.error(`${err.message}\n${err.stack}`)
        }
      }
    })
  })
})

function getRouter() {
  if (!SingletonRouter.router) {
    const message = 'No router instance found.\n' +
      'You should only use "next/router" inside the client side of your app.\n'
    throw new Error(message)
  }
  return SingletonRouter.router
}

// Export the SingletonRouter and this is the public API.
export default SingletonRouter as ISingletonRouter

// Reexport the withRoute HOC
export { default as withRouter } from './with-router'

export function useRouter() {
  return React.useContext(RouterContext)
}

export function useRequest() {
  return React.useContext(RequestContext)
}

// INTERNAL APIS
// -------------
// (do not use following exports inside the app)

// Create a router and assign it as the singleton instance.
// This is used in client side when we are initilizing the app.
// This should **not** use inside the server.
export const createRouter = (...args: RouterArgs) => {
  SingletonRouter.router = new Router(...args)
  SingletonRouter.readyCallbacks.forEach((cb) => cb())
  SingletonRouter.readyCallbacks = []

  return SingletonRouter.router
}

// This function is used to create the `withRouter` router instance
export function makePublicRouterInstance(router: Router): IPublicRouterInstance {
  const _router = router as any
  const instance = {} as any

  for (const property of urlPropertyFields) {
    if (typeof _router[property] === 'object') {
      instance[property] = { ..._router[property] } // makes sure query is not stateful
      continue
    }

    instance[property] = _router[property]
  }

  // Events is a static property on the router, the router doesn't have to be initialized to use it
  instance.events = Router.events

  propertyFields.forEach((field) => {
    // Here we need to use Object.defineProperty because, we need to return
    // the property assigned to the actual router
    // The value might get changed as we change routes and this is the
    // proper way to access it
    Object.defineProperty(instance, field, {
      get() {
        return _router[field]
      },
    })
  })

  coreMethodFields.forEach((field) => {
    instance[field] = (...args: any[]) => {
      return _router[field](...args)
    }
  })

  return instance
}
