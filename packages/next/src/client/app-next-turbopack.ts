// TODO-APP: hydration warning

import { appBootstrap } from './app-bootstrap'

window.next.version += '-turbo'
;(self as any).__webpack_hash__ = ''

appBootstrap(() => {
  const { hydrate } = require('./app-index')
  hydrate()

  if (process.env.NODE_ENV !== 'production') {
    const { initializeDevBuildIndicatorForAppRouter } =
      require('./dev/dev-build-indicator/initialize-for-app-router') as typeof import('./dev/dev-build-indicator/initialize-for-app-router')
    initializeDevBuildIndicatorForAppRouter()
  }
})
