// TODO-APP: hydration warning

import './app-webpack'

import { renderAppDevOverlay } from 'next/dist/compiled/next-devtools'
import { appBootstrap } from './app-bootstrap'
import { getOwnerStack } from '../next-devtools/userspace/app/errors/stitched-error'
import { isRecoverableError } from './react-client-callbacks/on-recoverable-error'

// eslint-disable-next-line @next/internal/typechecked-require
const instrumentationHooks = require('../lib/require-instrumentation-client')

appBootstrap((assetPrefix) => {
  const { hydrate } = require('./app-index') as typeof import('./app-index')
  try {
    hydrate(instrumentationHooks, assetPrefix)
  } finally {
    const enableCacheIndicator = process.env.__NEXT_CACHE_COMPONENTS
    renderAppDevOverlay(getOwnerStack, isRecoverableError, enableCacheIndicator)
  }
})
