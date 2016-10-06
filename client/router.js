import { parse } from 'url'
import evalScript from './eval-script'
import shallowEquals from './shallow-equals'

export default class Router {
  constructor (initialData) {
    this.subscriptions = []

    const id = createUid()
    const route = toRoute(location.pathname)

    this.currentRoute = route
    this.currentComponentData = { ...initialData, id }

    // set up the component cache (by route keys)
    this.components = { [route]: initialData }

    // in order for `e.state` to work on the `onpopstate` event
    // we have to register the initial route upon initialization
    this.replace(id, getURL())

    this.onPopState = this.onPopState.bind(this)
    window.addEventListener('unload', () => {})
    window.addEventListener('popstate', this.onPopState)
  }

  onPopState (e) {
    this.abortComponentLoad()
    const cur = this.currentComponentData.id
    const url = getURL()
    const { fromComponent, route } = e.state || {}
    if (fromComponent && cur && fromComponent === cur) {
      // if the component has not changed due
      // to the url change, it means we only
      // need to notify the subscriber about
      // the URL change
      this.set(url)
    } else {
      this.fetchComponent(route || url, (err, data) => {
        if (err) {
          // the only way we can appropriately handle
          // this failure is deferring to the browser
          // since the URL has already changed
          location.reload()
        } else {
          this.currentRoute = route || toRoute(location.pathname)
          this.currentComponentData = data
          this.set(url)
        }
      })
    }
  }

  update (route, data) {
    data.Component = evalScript(data.component).default
    delete data.component
    this.components[route] = data
    if (route === this.currentRoute) {
      let cancelled = false
      const cancel = () => { cancelled = true }
      this.componentLoadCancel = cancel
      getInitialProps(data, (err, dataWithProps) => {
        if (cancel === this.componentLoadCancel) {
          this.componentLoadCancel = false
        }
        if (cancelled) return
        if (err) throw err
        this.currentComponentData = dataWithProps
        this.notify()
      })
    }
  }

  goTo (url, fn) {
    this.change('pushState', null, url, fn)
  }

  back () {
    history.back()
  }

  push (fromComponent, url, fn) {
    this.change('pushState', fromComponent, url, fn)
  }

  replace (id, url, fn) {
    this.change('replaceState', id, url, fn)
  }

  change (method, id, url, fn) {
    this.abortComponentLoad()

    const set = (id) => {
      const state = id ? { fromComponent: id, route: this.currentRoute } : {}
      history[method](state, null, url)
      this.set(url)
      if (fn) fn(null)
    }

    if (this.currentComponentData && id !== this.currentComponentData.id) {
      this.fetchComponent(url, (err, data) => {
        if (!err) {
          this.currentRoute = toRoute(url)
          this.currentComponentData = data
          set(data.id)
        }
        if (fn) fn(err, data)
      })
    } else {
      set(id)
    }
  }

  set (url) {
    const parsed = parse(url, true)
    if (this.urlIsNew(parsed)) {
      this.pathname = parsed.pathname
      this.query = parsed.query
      this.notify()
    }
  }

  urlIsNew ({ pathname, query }) {
    return this.pathname !== pathname || !shallowEquals(query, this.query)
  }

  fetchComponent (url, fn) {
    const { pathname } = parse(url)
    const route = toRoute(pathname)

    let cancelled = false
    let componentXHR = null
    const cancel = () => {
      cancelled = true

      if (componentXHR && componentXHR.abort) {
        componentXHR.abort()
      }
    }

    if (this.components[route]) {
      const data = this.components[route]
      getInitialProps(data, (err, dataWithProps) => {
        if (cancel === this.componentLoadCancel) {
          this.componentLoadCancel = false
        }
        if (cancelled) return
        fn(err, dataWithProps)
      })
      this.componentLoadCancel = cancel
      return
    }

    const componentUrl = toJSONUrl(route)

    componentXHR = loadComponent(componentUrl, (err, data) => {
      if (cancel === this.componentLoadCancel) {
        this.componentLoadCancel = false
      }
      if (err) {
        if (!cancelled) fn(err)
      } else {
        const d = { ...data, id: createUid() }
        // we update the cache even if cancelled
        if (!this.components[route]) {
          this.components[route] = d
        }
        if (!cancelled) fn(null, d)
      }
    })

    this.componentLoadCancel = cancel
  }

  abortComponentLoad () {
    if (this.componentLoadCancel) {
      this.componentLoadCancel()
      this.componentLoadCancel = null
    }
  }

  notify () {
    this.subscriptions.forEach(fn => fn())
  }

  subscribe (fn) {
    this.subscriptions.push(fn)
    return () => {
      const i = this.subscriptions.indexOf(fn)
      if (~i) this.subscriptions.splice(i, 1)
    }
  }
}

// every route finishing in `/test/` becomes `/test`

export function toRoute (path) {
  return path.replace(/\/$/, '') || '/'
}

export function toJSONUrl (route) {
  return ('/' === route ? '/index' : route) + '.json'
}

export function loadComponent (url, fn) {
  return loadJSON(url, (err, data) => {
    if (err && fn) fn(err)
    const { component, props } = data
    const Component = evalScript(component).default
    getInitialProps({ Component, props }, fn)
  })
}

function getURL () {
  return location.pathname + (location.search || '') + (location.hash || '')
}

function createUid () {
  return Math.floor(Math.random() * 1e16)
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
    if (fn) fn(new Error('XHR failed. Status: ' + xhr.status))
  }
  xhr.open('GET', url)
  xhr.send()

  return xhr
}

function getInitialProps (data, fn) {
  const { Component: { getInitialProps } } = data
  if (getInitialProps) {
    Promise.resolve(getInitialProps({}))
    .then((props) => fn(null, { ...data, props }))
    .catch(fn)
  } else {
    fn(null, data)
  }
}
