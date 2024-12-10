/* global window */
import React from 'react'
import Router from '../shared/lib/router/router'
import type { NextRouter } from '../shared/lib/router/router'
import { RouterContext } from '../shared/lib/router-context.shared-runtime'
import isError from '../lib/is-error'

type SingletonRouterBase = {
  router: Router | null
  readyCallbacks: Array<() => void>
  ready(cb: () => void): void
}

export { Router }
export type { NextRouter }

export type SingletonRouter = SingletonRouterBase & NextRouter

const singletonRouter: SingletonRouterBase = {
  router: null, // Holds the actual router instance
  readyCallbacks: [],
  ready(callback: () => void) {
    if (this.router) {
      callback()
    } else if (typeof window !== 'undefined') {
      this.readyCallbacks.push(callback)
    }
  },
}

// Public properties of the router to expose
const urlPropertyFields = [
  'pathname',
  'route',
  'query',
  'asPath',
  'components',
  'isFallback',
  'basePath',
  'locale',
  'locales',
  'defaultLocale',
  'isReady',
  'isPreview',
  'isLocaleDomain',
  'domainLocales',
] as const

const routerEvents = [
  'routeChangeStart',
  'beforeHistoryChange',
  'routeChangeComplete',
  'routeChangeError',
  'hashChangeStart',
  'hashChangeComplete',
] as const

export type RouterEvent = (typeof routerEvents)[number]

const coreMethodFields = [
  'push',
  'replace',
  'reload',
  'back',
  'prefetch',
  'beforePopState',
] as const

// Attach events to the singleton router
Object.defineProperty(singletonRouter, 'events', {
  get() {
    return Router.events
  },
})

function getRouter(): Router {
  if (!singletonRouter.router) {
    throw new Error(
      'No router instance found. Ensure you are using "next/router" on the client side only.'
    )
  }
  return singletonRouter.router
}

// Define URL properties dynamically
urlPropertyFields.forEach((field) => {
  Object.defineProperty(singletonRouter, field, {
    get() {
      const router = getRouter()
      return router[field as keyof Router]
    },
  })
})

// Define core method bindings
coreMethodFields.forEach((field) => {
  ;(singletonRouter as any)[field] = (...args: any[]) => {
    const router = getRouter()
    return router[field as keyof Router](...args)
  }
})

// Define router event listeners
routerEvents.forEach((event) => {
  singletonRouter.ready(() => {
    Router.events.on(event, (...args) => {
      const eventField = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`
      const handler = (singletonRouter as any)[eventField]
      if (typeof handler === 'function') {
        try {
          handler(...args)
        } catch (err) {
          console.error(`Error in Router event handler: ${eventField}`)
          console.error(
            isError(err) ? `${err.message}\n${err.stack}` : String(err)
          )
        }
      }
    })
  })
})

// Export the singleton router as the public API
export default singletonRouter as SingletonRouter

// Reexport the withRouter HOC
export { default as withRouter } from './with-router'

/**
 * Access the Next.js router object via the useRouter hook.
 * Throws an error if the hook is used outside of RouterContext.
 */
export function useRouter(): NextRouter {
  const router = React.useContext(RouterContext)
  if (!router) {
    throw new Error(
      'NextRouter was not mounted. Ensure RouterContext is correctly set up.'
    )
  }
  return router
}

/**
 * Initialize and assign the singleton router instance.
 * Should only be used on the client side during app initialization.
 * @internal
 */
export function createRouter(
  ...args: ConstructorParameters<typeof Router>
): Router {
  singletonRouter.router = new Router(...args)
  singletonRouter.readyCallbacks.forEach((cb) => cb())
  singletonRouter.readyCallbacks = [] // Clear callbacks after execution
  return singletonRouter.router
}

/**
 * Create a public router instance, scoped for the withRouter HOC.
 * @internal
 */
export function makePublicRouterInstance(router: Router): NextRouter {
  const instance: Partial<NextRouter> = {}

  urlPropertyFields.forEach((property) => {
    instance[property] = router[property as keyof Router]
  })

  instance.events = Router.events

  coreMethodFields.forEach((field) => {
    instance[field] = (...args: any[]) => {
      return router[field as keyof Router](...args)
    }
  })

  return instance as NextRouter
}

