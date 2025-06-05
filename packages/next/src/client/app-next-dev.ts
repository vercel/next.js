// TODO-APP: hydration warning

import './app-webpack'

import { appBootstrap } from './app-bootstrap'

// eslint-disable-next-line @next/internal/typechecked-require
const instrumentationHooks = require('../lib/require-instrumentation-client')

appBootstrap(() => {
  const { hydrate } = require('./app-index') as typeof import('./app-index')
  hydrate(instrumentationHooks)
})
