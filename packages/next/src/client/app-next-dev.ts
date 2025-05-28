// TODO-APP: hydration warning

import './app-webpack'

import { appBootstrap } from './app-bootstrap'
import {
  getComponentStack,
  getOwnerStack,
} from './components/errors/stitched-error'
import { renderAppDevOverlay } from './components/react-dev-overlay/app/app-dev-overlay' with { 'turbopack-transition': 'nextjs-devtools' }
import { isRecoverableError } from './react-client-callbacks/on-recoverable-error'

// eslint-disable-next-line @next/internal/typechecked-require
const instrumentationHooks = require('../lib/require-instrumentation-client')

appBootstrap(() => {
  const { hydrate } = require('./app-index') as typeof import('./app-index')
  try {
    hydrate(instrumentationHooks)
  } finally {
    renderAppDevOverlay(getComponentStack, getOwnerStack, isRecoverableError)
  }
})
