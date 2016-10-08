import { parse } from 'url'
import evalScript from './eval-script'
import shallowEquals from './shallow-equals'

export default class Router {
  constructor (initialData) {
    // represents the current component key
    this.route = toRoute(location.pathname)

    // set up the component cache (by route keys)
    this.components = { [this.route]: initialData }

    this.subscriptions = new Set()
    this.componentLoadCancel = null
    this.onPopState = this.onPopState.bind(this)

    window.addEventListener('popstate', this.onPopState)
  }

  onPopState (e) {
    this.abortComponentLoad()

    const route = (e.state || {}).route || toRoute(location.pathname)

    Promise.resolve()
    .then(async () => {
      const data = await this.fetchComponent(route)
      let props
      if (route !== this.route) {
        props = await this.getInitialProps(data.Component)
      }

      this.route = route
      this.set(getURL(), { ...data, props })
    })
    .catch((err) => {
      if (err.cancelled) return

      // the only way we can appropriately handle
      // this failure is deferring to the browser
      // since the URL has already changed
      location.reload()
    })
  }

  async update (route, data) {
    data.Component = evalScript(data.component).default
    delete data.component
    this.components[route] = data

    if (route === this.route) {
      let props
      try {
        props = await this.getInitialProps(data.Component)
      } catch (err) {
        if (err.cancelled) return false
        throw err
      }
      this.notify({ ...data, props })
    }
    return true
  }

  back () {
    history.back()
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
        props = await this.getInitialProps(data.Component)
      }
    } catch (err) {
      if (err.cancelled) return false
      throw err
    }

    history[method]({ route }, null, url)
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
    if (data) return data

    let cancel
    let cancelled = false

    const componentUrl = toJSONUrl(route)
    data = await new Promise((resolve, reject) => {
      this.componentLoadCancel = cancel = () => {
        cancelled = true
        if (componentXHR.abort) componentXHR.abort()

        const err = new Error('Cancelled')
        err.cancelled = true
        reject(err)
      }

      const componentXHR = loadComponent(componentUrl, (err, data) => {
        if (err) return reject(err)
        resolve(data)
      })
    })

    if (cancel === this.componentLoadCancel) {
      this.componentLoadCancel = null
    }

    // we update the cache even if cancelled
    if (data) this.components[route] = data

    if (cancelled) {
      const err = new Error('Cancelled')
      err.cancelled = true
      throw err
    }

    return data
  }

  async getInitialProps (Component) {
    let cancelled = false
    const cancel = () => { cancelled = true }
    this.componentLoadCancel = cancel

    const props = await (Component.getInitialProps ? Component.getInitialProps({}) : {})

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
  return location.pathname + (location.search || '') + (location.hash || '')
}

function toRoute (path) {
  return path.replace(/\/$/, '') || '/'
}

function toJSONUrl (route) {
  return ('/' === route ? '/index' : route) + '.json'
}

function loadComponent (url, fn) {
  return loadJSON(url, (err, data) => {
    if (err) return fn(err)

    const { component } = data

    let module
    try {
      module = evalScript(component)
    } catch (err) {
      return fn(err)
    }

    const Component = module.default || module
    fn(null, { Component })
  })
}

function loadJSON (url, fn) {
  const xhr = new XMLHttpRequest()
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
  xhr.open('GET', url)
  xhr.send()

  return xhr
}
