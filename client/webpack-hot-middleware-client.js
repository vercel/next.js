import webpackHotMiddlewareClient from 'webpack-hot-middleware/client?overlay=false&reload=true'
import Router from '../lib/router'

const handlers = {
  reload (route) {
    if (route === '/_error') {
      for (const r of Object.keys(Router.components)) {
        const { Component } = Router.components[r]
        if (Component.__route === '/_error-debug') {
          // reload all '/_error-debug'
          // which are expected to be errors of '/_error' routes
          Router.reload(r)
        }
      }
      return
    }

    Router.reload(route)
  },
  change (route) {
    const { Component } = Router.components[route] || {}
    if (Component && Component.__route === '/_error-debug') {
      // reload to recover from runtime errors
      Router.reload(route)
    }
  },
  hardReload () {
    window.location.reload()
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
