/* global __NEXT_DATA__, location */

import { parse } from 'url'
import mitt from '../mitt'
import { loadGetInitialProps, getURL, formatWithValidation } from '../utils'

export default class Router {
  static events = mitt()

  constructor (pathname, query, as, { initialProps, pageLoader, App, Component, err } = {}) {
    // represents the current component key
    this.route = toRoute(pathname)

    // set up the component cache (by route keys)
    this.components = {}
    // We should not keep the cache, if there's an error
    // Otherwise, this cause issues when when going back and
    // come again to the errored page.
    if (pathname !== '/_error') {
      this.components[this.route] = { Component, props: initialProps, err }
    }

    this.components['/_app'] = { Component: App }

    // Backwards compat for Router.router.events
    // TODO: Should be remove the following major version as it was never documented
    this.events = Router.events

    this.pageLoader = pageLoader
    this.pathname = pathname
    this.query = query
    this.asPath = as
    this.subscriptions = new Set()
    this.componentLoadCancel = null
    this._beforePopState = () => true

    if (typeof window !== 'undefined') {
      // in order for `e.state` to work on the `onpopstate` event
      // we have to register the initial route upon initialization
      this.changeState('replaceState', formatWithValidation({ pathname, query }), as)

      window.addEventListener('popstate', this.onPopState)

      // Workaround for weird Firefox bug, see below links
      // https://github.com/zeit/next.js/issues/3817
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1422334
      // TODO: let's remove this once the Firefox bug is resolved
      if (navigator.userAgent && navigator.userAgent.match(/firefox/i)) {
        window.addEventListener('unload', () => {
          if (location.search) location.replace(location)
        })
      }
    }
  }

  static _rewriteUrlForNextExport (url) {
    const [, hash] = url.split('#')
    url = url.replace(/#.*/, '')

    let [path, qs] = url.split('?')
    path = path.replace(/\/$/, '')

    let newPath = path
    // Append a trailing slash if this path does not have an extension
    if (!/\.[^/]+\/?$/.test(path)) {
      newPath = `${path}/`
    }

    if (qs) {
      newPath = `${newPath}?${qs}`
    }

    if (hash) {
      newPath = `${newPath}#${hash}`
    }

    return newPath
  }

  onPopState = e => {
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
      this.changeState('replaceState', formatWithValidation({ pathname, query }), getURL())
      return
    }

    // If the downstream application returns falsy, return.
    // They will then be responsible for handling the event.
    if (!this._beforePopState(e.state)) {
      return
    }

    const { url, as, options } = e.state
    if (process.env.NODE_ENV !== 'production') {
      if (typeof url === 'undefined' || typeof as === 'undefined') {
        console.warn('`popstate` event triggered but `event.state` did not have `url` or `as` https://err.sh/zeit/next.js/popstate-state-empty')
      }
    }
    this.replace(url, as, options)
  };

  update (route, Component) {
    const data = this.components[route]
    if (!data) {
      throw new Error(`Cannot update unavailable route: ${route}`)
    }

    const newData = { ...data, Component }
    this.components[route] = newData

    // pages/_app.js updated
    if (route === '/_app') {
      this.notify(this.components[this.route])
      return
    }

    if (route === this.route) {
      this.notify(newData)
    }
  }

  async reload (route) {
    delete this.components[route]
    this.pageLoader.clearCache(route)

    if (route !== this.route) return

    const { pathname, query } = this
    const url = window.location.href
    // This makes sure we only use pathname + query + hash, to mirror `asPath` coming from the server.
    const as = window.location.pathname + window.location.search + window.location.hash

    Router.events.emit('routeChangeStart', url)
    const routeInfo = await this.getRouteInfo(route, pathname, query, as)
    const { error } = routeInfo

    if (error && error.cancelled) {
      return
    }

    this.notify(routeInfo)

    if (error) {
      Router.events.emit('routeChangeError', error, url)
      throw error
    }

    Router.events.emit('routeChangeComplete', url)
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

  async change (method, _url, _as, options) {
    // If url and as provided as an object representation,
    // we'll format them into the string version here.
    const url = typeof _url === 'object' ? formatWithValidation(_url) : _url
    let as = typeof _as === 'object' ? formatWithValidation(_as) : _as

    // Add the ending slash to the paths. So, we can serve the
    // "<page>/index.html" directly for the SSR page.
    if (__NEXT_DATA__.nextExport) {
      as = Router._rewriteUrlForNextExport(as)
    }

    this.abortComponentLoad(as)

    // If the url change is only related to a hash change
    // We should not proceed. We should only change the state.
    if (this.onlyAHashChange(as)) {
      Router.events.emit('hashChangeStart', as)
      this.changeState(method, url, as)
      this.scrollToHash(as)
      Router.events.emit('hashChangeComplete', as)
      return true
    }

    const { pathname, query } = parse(url, true)

    // If asked to change the current URL we should reload the current page
    // (not location.reload() but reload getInitialProps and other Next.js stuffs)
    // We also need to set the method = replaceState always
    // as this should not go into the history (That's how browsers work)
    // We should compare the new asPath to the current asPath, not the url
    if (!this.urlIsNew(as)) {
      method = 'replaceState'
    }

    const route = toRoute(pathname)
    const { shallow = false } = options
    let routeInfo = null

    Router.events.emit('routeChangeStart', as)

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

    Router.events.emit('beforeHistoryChange', as)
    this.changeState(method, url, as, options)
    const hash = window.location.hash.substring(1)

    this.set(route, pathname, query, as, { ...routeInfo, hash })

    if (error) {
      Router.events.emit('routeChangeError', error, as)
      throw error
    }

    Router.events.emit('routeChangeComplete', as)
    return true
  }

  changeState (method, url, as, options = {}) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof window.history === 'undefined') {
        console.error(`Warning: window.history is not available.`)
        return
      }
      if (typeof window.history[method] === 'undefined') {
        console.error(`Warning: window.history.${method} is not available`)
        return
      }
    }

    if (method !== 'pushState' || getURL() !== as) {
      window.history[method]({ url, as, options }, null, as)
    }
  }

  async getRouteInfo (route, pathname, query, as) {
    let routeInfo = null

    try {
      routeInfo = this.components[route]
      if (!routeInfo) {
        routeInfo = { Component: await this.fetchComponent(route, as) }
      }

      const { Component } = routeInfo

      if (process.env.NODE_ENV !== 'production') {
        const { isValidElementType } = require('react-is')
        if (!isValidElementType(Component)) {
          throw new Error(`The default export is not a React Component in page: "${pathname}"`)
        }
      }

      const ctx = { pathname, query, asPath: as }
      routeInfo.props = await this.getInitialProps(Component, ctx)

      this.components[route] = routeInfo
    } catch (err) {
      if (err.code === 'PAGE_LOAD_ERROR') {
        // If we can't load the page it could be one of following reasons
        //  1. Page doesn't exists
        //  2. Page does exist in a different zone
        //  3. Internal error while loading the page

        // So, doing a hard reload is the proper way to deal with this.
        window.location.href = as

        // Changing the URL doesn't block executing the current code path.
        // So, we need to mark it as a cancelled error and stop the routing logic.
        err.cancelled = true
        return { error: err }
      }

      if (err.cancelled) {
        return { error: err }
      }

      const Component = await this.fetchComponent('/_error')
      routeInfo = { Component, err }
      const ctx = { err, pathname, query }
      try {
        routeInfo.props = await this.getInitialProps(Component, ctx)
      } catch (err) {
        console.error('Error in error page `getInitialProps`: ', err)
        routeInfo.props = {}
      }

      routeInfo.error = err
    }

    return routeInfo
  }

  set (route, pathname, query, as, data) {
    this.route = route
    this.pathname = pathname
    this.query = query
    this.asPath = as
    this.notify(data)
  }

  beforePopState (cb) {
    this._beforePopState = cb
  }

  onlyAHashChange (as) {
    if (!this.asPath) return false
    const [ oldUrlNoHash, oldHash ] = this.asPath.split('#')
    const [ newUrlNoHash, newHash ] = as.split('#')

    // Makes sure we scroll to the provided hash if the url/hash are the same
    if (newHash && (oldUrlNoHash === newUrlNoHash) && (oldHash === newHash)) {
      return true
    }

    // If the urls are change, there's more than a hash change
    if (oldUrlNoHash !== newUrlNoHash) {
      return false
    }

    // If the hash has changed, then it's a hash only change.
    // This check is necessary to handle both the enter and
    // leave hash === '' cases. The identity case falls through
    // and is treated as a next reload.
    return oldHash !== newHash
  }

  scrollToHash (as) {
    const [ , hash ] = as.split('#')
    // Scroll to top if the hash is just `#` with no value
    if (hash === '') {
      window.scrollTo(0, 0)
      return
    }

    // First we check if the element by id is found
    const idEl = document.getElementById(hash)
    if (idEl) {
      idEl.scrollIntoView()
      return
    }
    // If there's no element with the id, we check the `name` property
    // To mirror browsers
    const nameEl = document.getElementsByName(hash)[0]
    if (nameEl) {
      nameEl.scrollIntoView()
    }
  }

  urlIsNew (asPath) {
    return this.asPath !== asPath
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
    if (process.env.NODE_ENV !== 'production') return

    const { pathname } = parse(url)
    const route = toRoute(pathname)
    return this.pageLoader.prefetch(route)
  }

  async fetchComponent (route, as) {
    let cancelled = false
    const cancel = this.componentLoadCancel = function () {
      cancelled = true
    }

    const Component = await this.fetchRoute(route)

    if (cancelled) {
      const error = new Error(`Abort fetching component for route: "${route}"`)
      error.cancelled = true
      throw error
    }

    if (cancel === this.componentLoadCancel) {
      this.componentLoadCancel = null
    }

    return Component
  }

  async getInitialProps (Component, ctx) {
    let cancelled = false
    const cancel = () => { cancelled = true }
    this.componentLoadCancel = cancel
    const { Component: App } = this.components['/_app']

    const props = await loadGetInitialProps(App, { Component, router: this, ctx })

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
    return this.pageLoader.loadPage(route)
  }

  abortComponentLoad (as) {
    if (this.componentLoadCancel) {
      Router.events.emit('routeChangeError', new Error('Route Cancelled'), as)
      this.componentLoadCancel()
      this.componentLoadCancel = null
    }
  }

  notify (data) {
    const { Component: App } = this.components['/_app']
    this.subscriptions.forEach((fn) => fn({ ...data, App }))
  }

  subscribe (fn) {
    this.subscriptions.add(fn)
    return () => this.subscriptions.delete(fn)
  }
}

function toRoute (path) {
  return path.replace(/\/$/, '') || '/'
}
