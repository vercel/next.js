import 'event-source-polyfill'
import connect from './dev-error-overlay/hot-dev-client'
import Router from '../lib/router'

const handlers = {
  reload (route) {
    // If the App component changes we have to reload the current route, this is handled by hot-self-accept-loader
    // So we just return
    if (route === '/_app') {
      return
    }

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

    // Since _document is server only we need to reload the full page when it changes.
    if (route === '/_document') {
      window.location.reload()
      return
    }

    Router.reload(route)
  },

  change (route) {
    // If the App component changes we have to reload the current route, this is handled by hot-self-accept-loader
    // So we just return
    if (route === '/_app') {
      return
    }

    const { err, Component } = Router.components[route] || {}

    if (err) {
      // reload to recover from runtime errors
      Router.reload(route)
    }

    if (Router.route !== route) {
      // If this is a not a change for a currently viewing page.
      // We don't need to worry about it.
      return
    }

    if (!Component) {
      // This only happens when we create a new page without a default export.
      // If you removed a default export from a exising viewing page, this has no effect.
      console.warn(`Hard reloading due to no default component in page: ${route}`)
      window.location.reload()
    }
  }
}

export default ({assetPrefix}) => {
  const options = {
    path: `${assetPrefix}/_next/webpack-hmr`
  }

  const devClient = connect(options)

  devClient.subscribeToHmrEvent((obj) => {
    const fn = handlers[obj.action]
    if (fn) {
      const data = obj.data || []
      fn(...data)
    } else {
      throw new Error('Unexpected action ' + obj.action)
    }
  })

  return devClient
}
