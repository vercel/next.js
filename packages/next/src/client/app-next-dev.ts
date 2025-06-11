// TODO-APP: hydration warning

import './app-webpack'

import { renderAppDevOverlay } from 'next/dist/compiled/next-devtools'
import { appBootstrap } from './app-bootstrap'
import {
  getComponentStack,
  getOwnerStack,
} from './components/react-dev-overlay/app/errors/stitched-error'
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
