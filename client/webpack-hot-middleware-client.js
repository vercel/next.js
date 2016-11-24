/* global next */
import webpackHotMiddlewareClient from 'webpack-hot-middleware/client?overlay=false&reload=true'

const handlers = {
  reload (route) {
    if (route === '/_error') {
      for (const r of Object.keys(next.router.components)) {
        const { Component } = next.router.components[r]
        if (Component.__route === '/_error-debug') {
          // reload all '/_error-debug'
          // which are expected to be errors of '/_error' routes
          next.router.reload(r)
        }
      }
      return
    }

    next.router.reload(route)
  },
  change (route) {
    const { Component } = next.router.components[route] || {}
    if (Component && Component.__route === '/_error-debug') {
      // reload to recover from runtime errors
      next.router.reload(route)
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
