/* global Raven */
import mitt from 'mitt'
import { formatPath, parsePath, getURL } from '../lib/url'

// set up the component cache (by route keys)
const components = {}

const SingletonRouter = {
  push (url, as, options) {
    return change('pushState', url, as || url, options)
  },

  replace (url, as, options) {
    return change('replaceState', url, as || url, options)
  }
}

export const events = mitt()
export default SingletonRouter

let subscriber
export function createRouter (pathname, query, as, routeInfo, _subscriber) {
  subscriber = _subscriber

  // represents the current component key
  SingletonRouter.route = toRoute(pathname)
  SingletonRouter.url = { pathname, query, asPath: as }

  components[SingletonRouter.route] = routeInfo

  if (typeof window !== 'undefined') {
    const originalState = { url: formatPath(SingletonRouter.url), as: getURL(), options: { shallow: true } }

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
      SingletonRouter.replace(url, as, options)
    })
  }
}

function change (method, _url, _as, options) {
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
  if (onlyAHashChange(as)) {
    changeState(method, url, as)
    return
  }

  const route = toRoute(pathname)
  const { shallow = false } = options

  if (!shallow || !components[route] || SingletonRouter.route !== route) {
    throw new Error('ENOTIMPL')
  }

  events.emit('routeChangeStart', as)

  const routeInfo = components[route]

  changeState(method, url, as, options)

  SingletonRouter.route = route
  SingletonRouter.url = { pathname, query, asPath: as }
  subscriber(routeInfo)

  events.emit('routeChangeComplete', as)
  return Promise.resolve(true)
}

function changeState (method, url, as, options = {}) {
  if (method !== 'pushState' || getURL() !== as) {
    console.log('changeState', method, as)
    window.history[method]({ url, as, options }, null, as)
  }
}

function onlyAHashChange (as) {
  if (!SingletonRouter.url.asPath) return false
  const [ oldUrlNoHash ] = SingletonRouter.url.asPath.split('#')
  const [ newUrlNoHash ] = as.split('#')

  // If the urls are change, there's more than a hash change
  return oldUrlNoHash === newUrlNoHash
}

function toRoute (path) {
  return path.replace(/\/$/, '') || '/'
}
