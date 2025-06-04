// TODO-APP: hydration warning

import './app-webpack'

import { appBootstrap } from './app-bootstrap'

const instrumentationHooks = require('../lib/require-instrumentation-client')

appBootstrap(() => {
  const { hydrate } = require('./app-index')
  hydrate(instrumentationHooks)
})
