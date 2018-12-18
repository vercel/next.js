/* global Raven */
import EventEmitter from '../EventEmitter'
import { getURL } from '../utils'
import { formatPath, parsePath } from '../url'

const subscriptions = []

export function subscribe (fn) {
  subscriptions.push(fn)
  return () => {
    let index = subscriptions.indexOf(fn)
    if (index >= 0) {
      subscriptions.splice(index, 1)
    }
  }
}
function notify (data) {
  subscriptions.forEach((fn) => fn(data))
}

function changeState (method, url, as, options = {}) {
  if (method !== 'pushState' || getURL() !== as) {
    console.log('changeState', method, as)
    window.history[method]({ url, as, options }, null, as)
  }
}

export default class Router {
  constructor (pathname, query, as, { Component, ErrorComponent, err } = {}) {
    // represents the current component key
    this.route = toRoute(pathname)

    // set up the component cache (by route keys)
    this.components = {}
    // We should not keep the cache, if there's an error
    // Otherwise, this cause issues when when going back and
    // come again to the errored page.
    if (Component !== ErrorComponent) {
      this.components[this.route] = { Component, err }
    }

    // Handling Router Events
    this.events = new EventEmitter()

    this.ErrorComponent = ErrorComponent
    this.pathname = pathname
    this.query = query
    this.asPath = as

    if (typeof window !== 'undefined') {
      const originalState = { url: formatPath(this), as: getURL(), options: { shallow: true } }

      window.addEventListener('popstate', (e) => {
        let state = e.state
        if ((!state || !state.url) && originalState.as === getURL()) {
          // If the current url matches the original, then restore the state from that
          // since we likely do not have state on the initial entry. This could happen
          // on navigation back to the initial page or on hash change on the initial
          // url, but the replace call below should be non-impactful.
          state = originalState
        }
        if (!state || !state.url) {
          // This is likely a hash change, NOP
          return
        }

        if (typeof Raven !== 'undefined') {
          Raven.captureBreadcrumb({
            message: 'popstate',
            data: {
              state
            }
          })
        }

        const { url, as, options } = state
        this.replace(url, as, options)
      })
    }
  }

  update (route, Component) {
    const data = this.components[route]
    if (!data) {
      throw new Error(`Cannot update unavailable route: ${route}`)
    }

    const newData = { ...data, Component }
    this.components[route] = newData

    notify(newData)
  }

  push (url, as = url, options = {}) {
    return this.change('pushState', url, as, options)
  }

  replace (url, as = url, options = {}) {
    return this.change('replaceState', url, as, options)
  }

  change (method, _url, _as, options) {
    if (typeof Raven !== 'undefined') {
      Raven.captureBreadcrumb({
        message: 'Router.change',
        data: {
          method,
          url: _url,
          as: _as,
          asNow: getURL()
        }
      })
    }
    // If url and as provided as an object representation,
    // we'll format them into the string version here.
    const url = typeof _url === 'object' ? formatPath(_url) : _url
    let as = typeof _as === 'object' ? formatPath(_as) : _as

    const { pathname, query } = parsePath(url, true)

    // If the url change is only related to a hash change
    // We should not proceed. We should only change the state.
    if (this.onlyAHashChange(as)) {
      changeState(method, url, as)
      return
    }

    const route = toRoute(pathname)
    const { shallow = false } = options

    if (!shallow || !this.components[route] || this.route !== route) {
      throw new Error('ENOTIMPL')
    }

    this.events.emit('routeChangeStart', as)

    const routeInfo = this.components[route]
    const { error } = routeInfo

    if (error && error.cancelled) {
      return Promise.resolve(false)
    }

    this.events.emit('beforeHistoryChange', as)
    changeState(method, url, as, options)
    const hash = window.location.hash.substring(1)

    this.route = route
    this.pathname = pathname
    this.query = query
    this.asPath = as
    notify({ ...routeInfo, hash })

    if (error) {
      this.events.emit('routeChangeError', error, as)
      return Promise.reject(error)
    }

    this.events.emit('routeChangeComplete', as)
    return Promise.resolve(true)
  }

  onlyAHashChange (as) {
    if (!this.asPath) return false
    const [ oldUrlNoHash ] = this.asPath.split('#')
    const [ newUrlNoHash ] = as.split('#')

    // If the urls are change, there's more than a hash change
    return oldUrlNoHash === newUrlNoHash
  }
}

function toRoute (path) {
  return path.replace(/\/$/, '') || '/'
}
