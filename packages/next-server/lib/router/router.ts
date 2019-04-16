/* global __NEXT_DATA__ */
// tslint:disable:no-console
import { ComponentType } from 'react';
import { parse } from 'url';
import mitt, {MittEmitter} from '../mitt';
import { formatWithValidation, getURL, loadGetInitialProps, IContext, IAppContext } from '../utils';

function toRoute(path: string): string {
  return path.replace(/\/$/, '') || '/'
}

export interface IRouterInterface {
  route: string
  pathname: string
  query: string
  asPath: string
}

type RouteInfo = {
  Component: ComponentType,
  props?: any,
  err?: Error
  error?: any,
}

type Subscription = (data: {App?: ComponentType} & RouteInfo) => void

type BeforePopStateCallback = (state: any) => boolean

export default class Router implements IRouterInterface {
  route: string
  pathname: string
  query: string
  asPath: string
  components: {[pathname: string]: RouteInfo}
  subscriptions: Set<Subscription>
  componentLoadCancel: (() => void) | null
  pageLoader: any
  _bps: BeforePopStateCallback | undefined

  static events: MittEmitter = mitt()

  constructor(pathname: string, query: any, as: string, { initialProps, pageLoader, App, Component, err }: {initialProps: any, pageLoader: any, Component: ComponentType, App: ComponentType, err?: Error}) {
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
    // @ts-ignore backwards compatibility
    this.events = Router.events

    this.pageLoader = pageLoader
    this.pathname = pathname
    this.query = query
    this.asPath = as
    this.subscriptions = new Set()
    this.componentLoadCancel = null

    if (typeof window !== 'undefined') {
      // in order for `e.state` to work on the `onpopstate` event
      // we have to register the initial route upon initialization
      this.changeState('replaceState', formatWithValidation({ pathname, query }), as)

      window.addEventListener('popstate', this.onPopState)
      window.addEventListener('unload', () => {
        // Workaround for popstate firing on initial page load when
        // navigating back from an external site
        if (history.state) {
          const { url, as, options }: any = history.state
          this.changeState('replaceState', url, as, { ...options, fromExternal: true })
        }
      })
    }
  }

  static _rewriteUrlForNextExport(url: string): string {
    const [pathname, hash] = url.split('#')
    // tslint:disable-next-line
    let [path, qs] = pathname.split('?')
    path = path.replace(/\/$/, '')
    // Append a trailing slash if this path does not have an extension
    if (!/\.[^/]+\/?$/.test(path)) path += `/`
    if (qs) path += '?' + qs
    if (hash) path += '#' + hash
    return path
  }

  onPopState = (e: PopStateEvent): void => {
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

    // Make sure we don't re-render on initial load,
    // can be caused by navigating back from an external site
    if (e.state.options && e.state.options.fromExternal) {
      return
    }

    // If the downstream application returns falsy, return.
    // They will then be responsible for handling the event.
    if (this._bps && !this._bps(e.state)) {
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

  update(route: string, Component: ComponentType) {
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

  reload(route: string): Promise<void> {
    return new Promise((resolve, reject) => {
      delete this.components[route]
      this.pageLoader.clearCache(route)

      if (route !== this.route) {
        return resolve()
      }

      const { pathname, query } = this
      const url = window.location.href
      // This makes sure we only use pathname + query + hash, to mirror `asPath` coming from the server.
      const as = window.location.pathname + window.location.search + window.location.hash

      Router.events.emit('routeChangeStart', url)
      this.getRouteInfo(route, pathname, query, as).then((routeInfo) => {
        const { error } = routeInfo

        if (error && error.cancelled) {
          return resolve()
        }

        this.notify(routeInfo)

        if (error) {
          Router.events.emit('routeChangeError', error, url)
          return reject(error)
        }

        Router.events.emit('routeChangeComplete', url)
      })

    })

  }

  back() {
    window.history.back()
  }

  push(url: string, as: string = url, options = {}) {
    return this.change('pushState', url, as, options)
  }

  replace(url: string, as: string = url, options = {}) {
    return this.change('replaceState', url, as, options)
  }

  change(method: string, _url: string, _as: string, options: any): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // If url and as provided as an object representation,
      // we'll format them into the string version here.
      const url = typeof _url === 'object' ? formatWithValidation(_url) : _url
      let as = typeof _as === 'object' ? formatWithValidation(_as) : _as

      // Add the ending slash to the paths. So, we can serve the
      // "<page>/index.html" directly for the SSR page.
      if (process.env.__NEXT_EXPORT_TRAILING_SLASH) {
        // @ts-ignore this is temporarily global (attached to window)
        if (__NEXT_DATA__.nextExport) {
          as = Router._rewriteUrlForNextExport(as)
        }
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

      // @ts-ignore pathname is always a string
      const route = toRoute(pathname)
      const { shallow = false } = options

      Router.events.emit('routeChangeStart', as)

      // If shallow is true and the route exists in the router cache we reuse the previous result
      // @ts-ignore pathname is always a string
      this.getRouteInfo(route, pathname, query, as, shallow).then((routeInfo) => {
        const { error } = routeInfo

        if (error && error.cancelled) {
          return resolve(false)
        }

        Router.events.emit('beforeHistoryChange', as)
        this.changeState(method, url, as, options)
        const hash = window.location.hash.substring(1)

        // @ts-ignore pathname is always defined
        this.set(route, pathname, query, as, { ...routeInfo, hash })

        if (error) {
          Router.events.emit('routeChangeError', error, as)
          throw error
        }

        Router.events.emit('routeChangeComplete', as)
        return resolve(true)
      }, reject)
    })
  }

  changeState(method: string, url: string, as: string, options = {}): void {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof window.history === 'undefined') {
        console.error(`Warning: window.history is not available.`)
        return
      }
      // @ts-ignore method should always exist on history
      if (typeof window.history[method] === 'undefined') {
        console.error(`Warning: window.history.${method} is not available`)
        return
      }
    }

    if (method !== 'pushState' || getURL() !== as) {
      // @ts-ignore method should always exist on history
      window.history[method]({ url, as, options }, null, as)
    }
  }

  getRouteInfo(route: string, pathname: string, query: any, as: string, shallow: boolean = false): Promise<RouteInfo> {
    const cachedRouteInfo = this.components[route]

    // If there is a shallow route transition possible
    // If the route is already rendered on the screen.
    if (shallow && cachedRouteInfo && this.route === route) {
      return Promise.resolve(cachedRouteInfo)
    }

    return (new Promise((resolve, reject) => {
      if (cachedRouteInfo) {
        return resolve(cachedRouteInfo)
      }

      this.fetchComponent(route).then((Component) => resolve({Component}), reject)
    }) as Promise<RouteInfo>).then((routeInfo: RouteInfo) => {
      const { Component } = routeInfo

      if (process.env.NODE_ENV !== 'production') {
        const { isValidElementType } = require('react-is')
        if (!isValidElementType(Component)) {
          throw new Error(`The default export is not a React Component in page: "${pathname}"`)
        }
      }

      return (new Promise((resolve, reject) => {
        const ctx = { pathname, query, asPath: as }
        this.getInitialProps(Component, ctx).then((props) => {
          routeInfo.props = props
          this.components[route] = routeInfo
          resolve(routeInfo)
        }, reject)
      }) as Promise<RouteInfo>)
    }).catch((err) => {
      return (new Promise((resolve) => {
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
          // @ts-ignore TODO: fix the control flow here
          return resolve({ error: err })
        }

        if (err.cancelled) {
          // @ts-ignore TODO: fix the control flow here
          return resolve({ error: err })
        }

        resolve(this.fetchComponent('/_error').then((Component) => {
          const routeInfo: RouteInfo = { Component, err }
          const ctx = { err, pathname, query }
          return (new Promise((resolve) => {
            this.getInitialProps(Component, ctx).then((props) => {
              routeInfo.props = props
              routeInfo.error = err
              resolve(routeInfo)
            }, (gipErr) => {
              console.error('Error in error page `getInitialProps`: ', gipErr)
              routeInfo.error = err
              routeInfo.props = {}
              resolve(routeInfo)
            })
          }) as Promise<RouteInfo>)
        }))
      }) as Promise<RouteInfo>)
    })
  }

  set(route: string, pathname: string, query: any, as: string, data: RouteInfo): void {
    this.route = route
    this.pathname = pathname
    this.query = query
    this.asPath = as
    this.notify(data)
  }

  beforePopState(cb: BeforePopStateCallback) {
    this._bps = cb
  }

  onlyAHashChange(as: string): boolean {
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

  scrollToHash(as: string): void {
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

  urlIsNew(asPath: string): boolean {
    return this.asPath !== asPath
  }

  prefetch(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Prefetch is not supported in development mode because it would trigger on-demand-entries
      if (process.env.NODE_ENV !== 'production' || process.env.__NEXT_EXPERIMENTAL_DEBUG) return

      const { pathname } = parse(url)
      // @ts-ignore pathname is always defined
      const route = toRoute(pathname)
      this.pageLoader.prefetch(route).then(resolve, reject)
    })
  }

  async fetchComponent(route: string): Promise<ComponentType> {
    let cancelled = false
    const cancel = this.componentLoadCancel = () => {
      cancelled = true
    }

    const Component = await this.pageLoader.loadPage(route)

    if (cancelled) {
      const error: any = new Error(`Abort fetching component for route: "${route}"`)
      error.cancelled = true
      throw error
    }

    if (cancel === this.componentLoadCancel) {
      this.componentLoadCancel = null
    }

    return Component
  }

  async getInitialProps(Component: ComponentType, ctx: IContext): Promise<any> {
    let cancelled = false
    const cancel = () => { cancelled = true }
    this.componentLoadCancel = cancel
    const { Component: App } = this.components['/_app']

    const props = await loadGetInitialProps<IAppContext<Router>>(App, { Component, router: this, ctx })

    if (cancel === this.componentLoadCancel) {
      this.componentLoadCancel = null
    }

    if (cancelled) {
      const err: any = new Error('Loading initial props cancelled')
      err.cancelled = true
      throw err
    }

    return props
  }

  abortComponentLoad(as: string): void {
    if (this.componentLoadCancel) {
      Router.events.emit('routeChangeError', new Error('Route Cancelled'), as)
      this.componentLoadCancel()
      this.componentLoadCancel = null
    }
  }

  notify(data: RouteInfo): void {
    const { Component: App } = this.components['/_app']
    this.subscriptions.forEach((fn) => fn({ ...data, App }))
  }

  subscribe(fn: Subscription): () => void {
    this.subscriptions.add(fn)
    return () => this.subscriptions.delete(fn)
  }
}
