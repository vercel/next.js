import { parse, format } from 'url'
import { EventEmitter } from 'events'
import evalScript from '../eval-script'
import shallowEquals from '../shallow-equals'
import PQueue from '../p-queue'
import { loadGetInitialProps, getURL } from '../utils'
import { _notifyBuildIdMismatch } from './'
import fetch from 'unfetch'

if (typeof window !== 'undefined' && typeof navigator.serviceWorker !== 'undefined') {
  navigator.serviceWorker.getRegistrations()
    .then(registrations => {
      registrations.forEach(registration => {
        if (!registration.active) {
          return
        }

        if (registration.active.scriptURL.indexOf('_next-prefetcher.js') === -1) {
          return
        }

        console.warn(`Unregistered deprecated 'next/prefetch' ServiceWorker. See https://github.com/zeit/next.js#prefetching-pages`)
        registration.unregister()
      })
    })
}

export default class Router extends EventEmitter {
  constructor (pathname, query, as, { Component, ErrorComponent, err } = {}) {
    super()
    // represents the current component key
    this.route = toRoute(pathname)

    // set up the component cache (by route keys)
    this.components = { [this.route]: { Component, err } }

    // contain a map of promise of fetch routes
    this.fetchingRoutes = {}

    this.prefetchQueue = new PQueue({ concurrency: 2 })
    this.ErrorComponent = ErrorComponent
    this.pathname = pathname
    this.query = query
    this.as = as
    this.subscriptions = new Set()
    this.componentLoadCancel = null
    this.onPopState = this.onPopState.bind(this)

    if (typeof window !== 'undefined') {
      // in order for `e.state` to work on the `onpopstate` event
      // we have to register the initial route upon initialization
      this.changeState('replaceState', format({ pathname, query }), getURL())

      window.addEventListener('popstate', this.onPopState)
    }
  }

  async onPopState (e) {
    if (!e.state) {
      // We get state as undefined for two reasons.
      //  1. With older safari (< 8) and older chrome (< 34)
      //  2. When the URL changed with #
      //
      // In the both cases, we don't need to proceed and change the route.
      // (as it's already changed)
      // But we can simply replace the state with the new changes.
      // Actually, for (1) we don't need to nothing. But it's hard to detect that event.
      // So, doing the following for (1) does no harm.
      const { pathname, query } = this
      this.changeState('replaceState', format({ pathname, query }), getURL())
      return
    }

    const { url, as, options } = e.state
    this.replace(url, as, options)
  }

  update (route, Component) {
    const data = this.components[route]
    if (!data) {
      throw new Error(`Cannot update unavailable route: ${route}`)
    }

    const newData = { ...data, Component }
    this.components[route] = newData

    if (route === this.route) {
      this.notify(newData)
    }
  }

  async reload (route) {
    delete this.components[route]
    delete this.fetchingRoutes[route]

    if (route !== this.route) return

    const url = window.location.href
    const { pathname, query } = parse(url, true)

    this.emit('routeChangeStart', url)
    const routeInfo = await this.getRouteInfo(route, pathname, query, url)
    const { error } = routeInfo

    if (error && error.cancelled) {
      return
    }

    this.notify(routeInfo)

    if (error) {
      this.emit('routeChangeError', error, url)
      throw error
    }

    this.emit('routeChangeComplete', url)
  }

  back () {
    window.history.back()
  }

  push (url, as = url, options = {}) {
    return this.change('pushState', url, as, options)
  }

  replace (url, as = url, options = {}) {
    return this.change('replaceState', url, as, options)
  }

  async change (method, url, as, options) {
    this.abortComponentLoad(as)
    const { pathname, query } = parse(url, true)

    // If the url change is only related to a hash change
    // We should not proceed. We should only replace the state.
    if (this.onlyAHashChange(as)) {
      this.changeState('replaceState', url, as)
      return
    }

    // If asked to change the current URL we should reload the current page
    // (not location.reload() but reload getInitalProps and other Next.js stuffs)
    // We also need to set the method = replaceState always
    // as this should not go into the history (That's how browsers work)
    if (!this.urlIsNew(pathname, query)) {
      method = 'replaceState'
    }

    const route = toRoute(pathname)
    const { shallow = false } = options
    let routeInfo = null

    this.emit('routeChangeStart', as)

    // If shallow === false and other conditions met, we reuse the
    // existing routeInfo for this route.
    // Because of this, getInitialProps would not run.
    if (shallow && this.isShallowRoutingPossible(route)) {
      routeInfo = this.components[route]
    } else {
      routeInfo = await this.getRouteInfo(route, pathname, query, as)
    }

    const { error } = routeInfo

    if (error && error.cancelled) {
      return false
    }

    this.changeState(method, url, as, options)
    const hash = window.location.hash.substring(1)

    this.set(route, pathname, query, as, { ...routeInfo, hash })

    if (error) {
      this.emit('routeChangeError', error, as)
      throw error
    }

    this.emit('routeChangeComplete', as)
    return true
  }

  changeState (method, url, as, options = {}) {
    if (method !== 'pushState' || getURL() !== as) {
      window.history[method]({ url, as, options }, null, as)
    }
  }

  async getRouteInfo (route, pathname, query, as) {
    let routeInfo = null

    try {
      routeInfo = this.components[route]
      if (!routeInfo) {
        routeInfo = await this.fetchComponent(route, as)
      }

      const { Component, err, jsonPageRes } = routeInfo
      const ctx = { err, pathname, query, jsonPageRes }
      routeInfo.props = await this.getInitialProps(Component, ctx)

      this.components[route] = routeInfo
    } catch (err) {
      if (err.cancelled) {
        return { error: err }
      }

      const Component = this.ErrorComponent
      routeInfo = { Component, err }
      const ctx = { err, pathname, query }
      routeInfo.props = await this.getInitialProps(Component, ctx)

      routeInfo.error = err
      console.error(err)
    }

    return routeInfo
  }

  set (route, pathname, query, as, data) {
    this.route = route
    this.pathname = pathname
    this.query = query
    this.as = as
    this.notify(data)
  }

  onlyAHashChange (as) {
    if (!this.as) return false
    const [ oldUrlNoHash ] = this.as.split('#')
    const [ newUrlNoHash, newHash ] = as.split('#')

    // If the urls are change, there's more than a hash change
    if (oldUrlNoHash !== newUrlNoHash) {
      return false
    }

    // If there's no hash in the new url, we can't consider it as a hash change
    if (!newHash) {
      return false
    }

    // Now there's a hash in the new URL.
    // We don't need to worry about the old hash.
    return true
  }

  urlIsNew (pathname, query) {
    return this.pathname !== pathname || !shallowEquals(query, this.query)
  }

  isShallowRoutingPossible (route) {
    return (
      // If there's cached routeInfo for the route.
      Boolean(this.components[route]) &&
      // If the route is already rendered on the screen.
      this.route === route
    )
  }

  async prefetch (url) {
    // We don't add support for prefetch in the development mode.
    // If we do that, our on-demand-entries optimization won't performs better
    if (process.env.NODE_ENV === 'development') return

    const { pathname } = parse(url)
    const route = toRoute(pathname)
    return this.prefetchQueue.add(() => this.fetchRoute(route))
  }

  async fetchComponent (route, as) {
    let cancelled = false
    const cancel = this.componentLoadCancel = function () {
      cancelled = true
    }

    const jsonPageRes = await this.fetchRoute(route)
    const jsonData = await jsonPageRes.json()

    if (jsonData.buildIdMismatch) {
      _notifyBuildIdMismatch(as)

      const error = Error('Abort due to BUILD_ID mismatch')
      error.cancelled = true
      throw error
    }

    const newData = {
      ...loadComponent(jsonData),
      jsonPageRes
    }

    if (cancelled) {
      const error = new Error(`Abort fetching component for route: "${route}"`)
      error.cancelled = true
      throw error
    }

    if (cancel === this.componentLoadCancel) {
      this.componentLoadCancel = null
    }

    return newData
  }

  async getInitialProps (Component, ctx) {
    let cancelled = false
    const cancel = () => { cancelled = true }
    this.componentLoadCancel = cancel

    const props = await loadGetInitialProps(Component, ctx)

    if (cancel === this.componentLoadCancel) {
      this.componentLoadCancel = null
    }

    if (cancelled) {
      const err = new Error('Loading initial props cancelled')
      err.cancelled = true
      throw err
    }

    return props
  }

  async fetchRoute (route) {
    let promise = this.fetchingRoutes[route]
    if (!promise) {
      promise = this.fetchingRoutes[route] = this.doFetchRoute(route)
    }

    const res = await promise
    // We need to clone this to prevent reading the body twice
    // Becuase it's possible only once to read res.json() or a similar method.
    return res.clone()
  }

  doFetchRoute (route) {
    const { buildId } = window.__NEXT_DATA__
    const url = `/_next/${encodeURIComponent(buildId)}/pages${route}`
    return fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
  }

  abortComponentLoad (as) {
    if (this.componentLoadCancel) {
      this.emit('routeChangeError', new Error('Route Cancelled'), as)
      this.componentLoadCancel()
      this.componentLoadCancel = null
    }
  }

  notify (data) {
    this.subscriptions.forEach((fn) => fn(data))
  }

  subscribe (fn) {
    this.subscriptions.add(fn)
    return () => this.subscriptions.delete(fn)
  }
}

function toRoute (path) {
  return path.replace(/\/$/, '') || '/'
}

function loadComponent (jsonData) {
  const module = evalScript(jsonData.component)
  const Component = module.default || module

  return { Component, err: jsonData.err }
}
