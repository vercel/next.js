import webpackHotMiddlewareClient from 'webpack-hot-middleware/client?overlay=false&reload=true'
import Router from '../lib/router'

const handlers = {
  reload (route) {
    if (route === '/_error') {
      for (const r of Object.keys(Router.components)) {
        const { err } = Router.components[r]
        if (err) {
          // reload all error routes
          // which are expected to be errors of '/_error' routes
          Router.reload(r)
        }
      }
      return
    }

    if (route === '/_document') {
      window.location.reload()
      return
    }

    Router.reload(route)
  },

  change (route) {
    if (route === '/_document') {
      window.location.reload()
      return
    }

    const { err } = Router.components[route] || {}
    if (err) {
      // reload to recover from runtime errors
      Router.reload(route)
    }
  }
}

webpackHotMiddlewareClient.subscribe((obj) => {
  const fn = handlers[obj.action]
  if (fn) {
    const data = obj.data || []
    fn(...data)
  } else {
    throw new Error('Unexpected action ' + obj.action)
  }
})
