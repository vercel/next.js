// This import must go first because it needs to patch webpack chunk loading
// before React patches chunk loading.
import './app-webpack'
import { appBootstrap } from './app-bootstrap'

const instrumentationHooks =
  // eslint-disable-next-line @next/internal/typechecked-require -- not a module
  require('../lib/require-instrumentation-client')

appBootstrap((assetPrefix) => {
  const { hydrate } = require('./app-index') as typeof import('./app-index')
  // Include app-router and layout-router in the main chunk
  // eslint-disable-next-line @next/internal/typechecked-require -- Why not relative imports?
  require('next/dist/client/components/app-router')
  // eslint-disable-next-line @next/internal/typechecked-require -- Why not relative imports?
  require('next/dist/client/components/layout-router')
  hydrate(instrumentationHooks, assetPrefix)
})
