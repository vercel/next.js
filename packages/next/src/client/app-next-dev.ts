// TODO-APP: hydration warning

import './app-webpack'
import '../lib/require-instrumentation-client'
import { appBootstrap } from './app-bootstrap'
import { initializeDevBuildIndicatorForAppRouter } from './dev/dev-build-indicator/initialize-for-app-router'

appBootstrap(() => {
  const { hydrate } = require('./app-index')
  hydrate()
  initializeDevBuildIndicatorForAppRouter()
})
