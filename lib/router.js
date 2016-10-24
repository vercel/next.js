import { parse } from 'url'
import evalScript from './eval-script'
import shallowEquals from './shallow-equals'

export default class Router {
  constructor (url, initialData) {
    const parsed = parse(url, true)

    // represents the current component key
    this.route = toRoute(parsed.pathname)

    // set up the component cache (by route keys)
    this.components = { [this.route]: initialData }

    this.pathname = parsed.pathname
    this.query = parsed.query
    this.subscriptions = new Set()
    this.componentLoadCancel = null
    this.onPopState = this.onPopState.bind(this)

    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', this.onPopState)
    }
  }

  onPopState (e) {
    this.abortComponentLoad()

    const route = (e.state || {}).route || toRoute(window.location.pathname)

    Promise.resolve()
    .then(async () => {
      const data = await this.fetchComponent(route)
      let props
      if (route !== this.route) {
        props = await this.getInitialProps(data.Component, data.ctx)
      }

      this.route = route
      this.set(getURL(), { ...data, props })
    })
    .catch((err) => {
      if (err.cancelled) return

      // the only way we can appropriately handle
      // this failure is deferring to the browser
      // since the URL has already changed
      window.location.reload()
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

    let data
    let props
    try {
      data = await this.fetchComponent(route)
      if (route === this.route) {
        props = await this.getInitialProps(data.Component, data.ctx)
      }
    } catch (err) {
      if (err.cancelled) return false
      throw err
    }

    this.notify({ ...data, props })
  }

  back () {
    window.history.back()
  }

  push (route, url) {
    return this.change('pushState', route, url)
  }

  replace (route, url) {
    return this.change('replaceState', route, url)
  }

  async change (method, route, url) {
    if (!route) route = toRoute(parse(url).pathname)

    this.abortComponentLoad()

    let data
    let props
    try {
      data = await this.fetchComponent(route)
      if (route !== this.route) {
        props = await this.getInitialProps(data.Component, data.ctx)
      }
    } catch (err) {
      if (err.cancelled) return false
      throw err
    }

    window.history[method]({ route }, null, url)
    this.route = route
    this.set(url, { ...data, props })
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

  async fetchComponent (url) {
    const route = toRoute(parse(url).pathname)

    let data = this.components[route]
    if (!data) {
      let cancel

      const componentUrl = toJSONUrl(route)
      data = await new Promise((resolve, reject) => {
        this.componentLoadCancel = cancel = () => {
          if (xhr.abort) xhr.abort()
        }

        const xhr = loadComponent(componentUrl, (err, data) => {
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

function toJSONUrl (route) {
  return (route === '/' ? '/index' : route) + '.json'
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
  xhr.send()

  return xhr
}
