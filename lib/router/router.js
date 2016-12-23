import { parse } from 'url'
import evalScript from '../eval-script'
import shallowEquals from '../shallow-equals'

export default class Router {
  constructor (pathname, query, { Component, ErrorComponent, ctx } = {}) {
    // represents the current component key
    this.route = toRoute(pathname)

    // set up the component cache (by route keys)
    this.components = { [this.route]: { Component, ctx } }

    this.ErrorComponent = ErrorComponent
    this.pathname = pathname
    this.query = query
    this.subscriptions = new Set()
    this.componentLoadCancel = null
    this.onPopState = this.onPopState.bind(this)

    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', this.onPopState)
    }
  }

  onPopState (e) {
    this.abortComponentLoad()

    let { route } = e.state || {}
    const { pathname, query } = parse(route || window.location.href, true)
    if (!route) route = toRoute(pathname)

    Promise.resolve()
    .then(async () => {
      const data = await this.fetchComponent(route)
      const ctx = { ...data.ctx, pathname, query }
      const props = await this.getInitialProps(data.Component, ctx)

      this.route = route
      this.set(getURL(), { ...data, props })
    })
    .catch(async (err) => {
      if (err.cancelled) return

      const data = { Component: this.ErrorComponent, ctx: { err } }
      const ctx = { ...data.ctx, pathname, query }
      const props = await this.getInitialProps(data.Component, ctx)

      this.route = route
      this.set(getURL(), { ...data, props })
      console.error(err)
    })
    .catch((err) => {
      console.error(err)
    })
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

    if (route !== this.route) return

    const { pathname, query } = parse(window.location.href, true)

    let data
    let props
    let _err
    try {
      data = await this.fetchComponent(route)
      const ctx = { ...data.ctx, pathname, query }
      props = await this.getInitialProps(data.Component, ctx)
    } catch (err) {
      if (err.cancelled) return false

      data = { Component: this.ErrorComponent, ctx: { err } }
      const ctx = { ...data.ctx, pathname, query }
      props = await this.getInitialProps(data.Component, ctx)

      _err = err
      console.error(err)
    }

    this.notify({ ...data, props })

    if (_err) throw _err
  }

  back () {
    window.history.back()
  }

  push (route, url = route) {
    return this.change('pushState', route, url)
  }

  replace (route, url = route) {
    return this.change('replaceState', route, url)
  }

  async change (method, route, url) {
    const { pathname, query } = parse(route || url, true)

    if (!route) route = toRoute(pathname)

    this.abortComponentLoad()

    let data
    let props
    let _err
    try {
      data = await this.fetchComponent(route)
      const ctx = { ...data.ctx, pathname, query }
      props = await this.getInitialProps(data.Component, ctx)
    } catch (err) {
      if (err.cancelled) return false

      data = { Component: this.ErrorComponent, ctx: { err } }
      const ctx = { ...data.ctx, pathname, query }
      props = await this.getInitialProps(data.Component, ctx)

      _err = err
      console.error(err)
    }

    if (getURL() !== url) {
      window.history[method]({ route }, null, url)
    }

    this.route = route
    this.set(url, { ...data, props })

    if (_err) throw _err

    return true
  }

  set (url, data) {
    const parsed = parse(url, true)

    if (this.urlIsNew(parsed)) {
      this.pathname = parsed.pathname
      this.query = parsed.query
      this.notify(data)
    }
  }

  urlIsNew ({ pathname, query }) {
    return this.pathname !== pathname || !shallowEquals(query, this.query)
  }

  async fetchComponent (route) {
    let data = this.components[route]
    if (!data) {
      let cancel

      data = await new Promise((resolve, reject) => {
        this.componentLoadCancel = cancel = () => {
          if (xhr.abort) xhr.abort()
        }

        const url = `/_next/pages${route}`
        const xhr = loadComponent(url, (err, data) => {
          if (err) return reject(err)
          resolve({
            Component: data.Component,
            ctx: { xhr, err: data.err }
          })
        })
      })

      if (cancel === this.componentLoadCancel) {
        this.componentLoadCancel = null
      }

      this.components[route] = data
    }
    return data
  }

  async getInitialProps (Component, ctx) {
    let cancelled = false
    const cancel = () => { cancelled = true }
    this.componentLoadCancel = cancel

    const props = await (Component.getInitialProps ? Component.getInitialProps(ctx) : {})

    if (cancel === this.componentLoadCancel) {
      this.componentLoadCancel = null
    }

    if (cancelled) {
      const err = new Error('Cancelled')
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

function loadComponent (url, fn) {
  return loadJSON(url, (err, data) => {
    if (err) return fn(err)

    let module
    try {
      module = evalScript(data.component)
    } catch (err) {
      return fn(err)
    }

    const Component = module.default || module
    fn(null, { Component, err: data.err })
  })
}

function loadJSON (url, fn) {
  const xhr = new window.XMLHttpRequest()
  xhr.onload = () => {
    let data

    try {
      data = JSON.parse(xhr.responseText)
    } catch (err) {
      fn(new Error('Failed to load JSON for ' + url))
      return
    }

    fn(null, data)
  }
  xhr.onerror = () => {
    fn(new Error('XHR failed. Status: ' + xhr.status))
  }
  xhr.onabort = () => {
    const err = new Error('XHR aborted')
    err.cancelled = true
    fn(err)
  }
  xhr.open('GET', url)
  xhr.setRequestHeader('Accept', 'application/json')
  xhr.send()

  return xhr
}
