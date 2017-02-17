/* global fetch */

import { parse, format } from 'url'
import { EventEmitter } from 'events'
import evalScript from '../eval-script'
import shallowEquals from '../shallow-equals'
import PQueue from '../p-queue'
import { loadGetInitialProps, getLocationOrigin } from '../utils'

// Add "fetch" polyfill for older browsers
if (typeof window !== 'undefined') {
  require('whatwg-fetch')
}

export default class Router extends EventEmitter {
  constructor (pathname, query, { Component, ErrorComponent, err } = {}) {
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
      this.replace(format({ pathname, query }), getURL())
      return
    }

    this.abortComponentLoad()

    const { url, as } = e.state
    const { pathname, query } = parse(url, true)

    if (!this.urlIsNew(pathname, query)) {
      this.emit('routeChangeStart', as)
      this.emit('routeChangeComplete', as)
      return
    }

    const route = toRoute(pathname)

    this.emit('routeChangeStart', as)
    const {
      data,
      props,
      error
    } = await this.getRouteInfo(route, pathname, query)

    if (error && error.cancelled) {
      this.emit('routeChangeError', error, as)
      return
    }

    this.route = route
    this.set(pathname, query, { ...data, props })

    if (error) {
      this.emit('routeChangeError', error, as)
    } else {
      this.emit('routeChangeComplete', as)
    }
  }

  update (route, Component) {
    const data = this.components[route] || {}
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
    const {
      data,
      props,
      error
    } = await this.getRouteInfo(route, pathname, query)

    if (error && error.cancelled) {
      this.emit('routeChangeError', error, url)
      return
    }

    this.notify({ ...data, props })

    if (error) {
      this.emit('routeChangeError', error, url)
      throw error
    }

    this.emit('routeChangeComplete', url)
  }

  back () {
    window.history.back()
  }

  push (url, as = url) {
    return this.change('pushState', url, as)
  }

  replace (url, as = url) {
    return this.change('replaceState', url, as)
  }

  async change (method, url, as) {
    this.abortComponentLoad()
    const { pathname, query } = parse(url, true)

    // If asked to change the current URL we should reload the current page
    // (not location.reload() but reload getInitalProps and other Next.js stuffs)
    // We also need to set the method = replaceState always
    // as this should not go into the history (That's how browsers work)
    if (!this.urlIsNew(pathname, query)) {
      method = 'replaceState'
    }

    const route = toRoute(pathname)

    this.emit('routeChangeStart', as)
    const {
      data, props, error
    } = await this.getRouteInfo(route, pathname, query)

    if (error && error.cancelled) {
      this.emit('routeChangeError', error, as)
      return false
    }

    this.changeState(method, url, as)

    this.route = route
    this.set(pathname, query, { ...data, props })

    if (error) {
      this.emit('routeChangeError', error, as)
      throw error
    }

    this.emit('routeChangeComplete', as)
    return true
  }

  changeState (method, url, as) {
    if (method !== 'pushState' || getURL() !== as) {
      window.history[method]({ url, as }, null, as)
    }
  }

  async getRouteInfo (route, pathname, query) {
    const routeInfo = {}

    try {
      const { Component, err, jsonPageRes } = routeInfo.data = await this.fetchComponent(route)
      const ctx = { err, pathname, query, jsonPageRes }
      routeInfo.props = await this.getInitialProps(Component, ctx)
    } catch (err) {
      if (err.cancelled) {
        return { error: err }
      }

      const Component = this.ErrorComponent
      routeInfo.data = { Component, err }
      const ctx = { err, pathname, query }
      routeInfo.props = await this.getInitialProps(Component, ctx)

      routeInfo.error = err
      console.error(err)
    }

    return routeInfo
  }

  set (pathname, query, data) {
    this.pathname = pathname
    this.query = query
    this.notify(data)
  }

  urlIsNew (pathname, query) {
    return this.pathname !== pathname || !shallowEquals(query, this.query)
  }

  async prefetch (url) {
    const { pathname } = parse(url)
    const route = toRoute(pathname)
    return this.prefetchQueue.add(() => this.fetchRoute(route))
  }

  async fetchComponent (route) {
    let data = this.components[route]
    if (data) return data

    let cancelled = false
    const cancel = this.componentLoadCancel = function () {
      cancelled = true
    }

    const jsonPageRes = await this.fetchRoute(route)
    const jsonData = await jsonPageRes.json()
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

    this.components[route] = newData
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

  abortComponentLoad () {
    if (this.componentLoadCancel) {
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

function getURL () {
  const { href } = window.location
  const origin = getLocationOrigin()
  return href.substring(origin.length)
}

function toRoute (path) {
  return path.replace(/\/$/, '') || '/'
}

function loadComponent (jsonData) {
  const module = evalScript(jsonData.component)
  const Component = module.default || module

  return { Component, err: jsonData.err }
}
