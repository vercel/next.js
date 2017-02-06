/* global __NEXT_DATA__, fetch */

import { parse, format } from 'url'
import evalScript from '../eval-script'
import shallowEquals from '../shallow-equals'
import { EventEmitter } from 'events'
import { reloadIfPrefetched } from '../prefetch'
import { loadGetInitialProps } from '../utils'

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

    this.ErrorComponent = ErrorComponent
    this.pathname = pathname
    this.query = query
    this.subscriptions = new Set()

    this.componentLoadCancel = null
    this.onPopState = this.onPopState.bind(this)

    if (typeof window !== 'undefined') {
      // in order for `e.state` to work on the `onpopstate` event
      // we have to register the initial route upon initialization
      this.replace(format({ pathname, query }), getURL())

      window.addEventListener('popstate', this.onPopState)
    }
  }

  async onPopState (e) {
    // Older versions of safari and chrome tend to fire popstate event at the
    // page load.
    // We should not complete that event and the following check will fix it.
    // Fixes:
    if (!e.state) {
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
    await reloadIfPrefetched(route)

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

    if (!this.urlIsNew(pathname, query)) {
      this.emit('routeChangeStart', as)
      changeState()
      this.emit('routeChangeComplete', as)
      return true
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

    changeState()

    this.route = route
    this.set(pathname, query, { ...data, props })

    if (error) {
      this.emit('routeChangeError', error, as)
      throw error
    }

    this.emit('routeChangeComplete', as)
    return true

    function changeState () {
      if (method !== 'pushState' || getURL() !== as) {
        window.history[method]({ url, as }, null, as)
      }
    }
  }

  async getRouteInfo (route, pathname, query) {
    const routeInfo = {}

    try {
      const { Component, err } = routeInfo.data = await this.fetchComponent(route)
      const ctx = { err, pathname, query }
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

  async fetchComponent (route) {
    let data = this.components[route]
    if (data) return data

    let cancelled = false
    const cancel = this.componentLoadCancel = function () {
      cancelled = true
    }

    const url = `/_next/${__NEXT_DATA__.buildId}/pages${route}`
    data = await loadComponent(url)

    if (cancelled) {
      const error = new Error(`Abort fetching component for url: "${url}"`)
      error.cancelled = true
      throw error
    }

    if (cancel === this.componentLoadCancel) {
      this.componentLoadCancel = null
    }

    this.components[route] = data
    return data
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
  return window.location.pathname + (window.location.search || '') + (window.location.hash || '')
}

function toRoute (path) {
  return path.replace(/\/$/, '') || '/'
}

async function loadComponent (url) {
  const data = await loadJSON(url)
  const module = evalScript(data.component)
  const Component = module.default || module

  return { Component, err: data.err }
}

async function loadJSON (url) {
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  })

  return await res.json()
}
