// This import must go first because it needs to patch webpack chunk loading
// before React patches chunk loading.
import './app-webpack'
import { appBootstrap } from './app-bootstrap'

const instrumentationHooks = require('../lib/require-instrumentation-client')

appBootstrap(() => {
  const { hydrate } = require('./app-index')
  // Include app-router and layout-router in the main chunk
  require('next/dist/client/components/app-router')
  require('next/dist/client/components/layout-router')
  hydrate(instrumentationHooks)
})
