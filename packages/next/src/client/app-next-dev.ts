// TODO-APP: hydration warning

import './app-webpack'

import {
  dispatcher,
  renderAppDevOverlay,
} from 'next/dist/compiled/next-devtools'
import { appBootstrap } from './app-bootstrap'
import { getOwnerStack } from '../next-devtools/userspace/app/errors/stitched-error'
import { isRecoverableError } from './react-client-callbacks/on-recoverable-error'

// eslint-disable-next-line @next/internal/typechecked-require
const instrumentationHooks = require('../lib/require-instrumentation-client')

appBootstrap((assetPrefix) => {
  const enableCacheIndicator = process.env.__NEXT_CACHE_COMPONENTS

  const { hydrate, getPendingShellError } =
    require('./app-index') as typeof import('./app-index')
  try {
    hydrate(instrumentationHooks, assetPrefix)
  } finally {
    renderAppDevOverlay(getOwnerStack, isRecoverableError, enableCacheIndicator)

    // If the dev error shell was served, dispatch the embedded error to the
    // overlay. This must happen after renderAppDevOverlay() so the overlay's
    // event queue is set up. Read after hydrate() since the synchronous
    // part of hydrate() sets it before returning.
    // Also open the error overlay (app router defaults to closed).
    const shellError = getPendingShellError()
    if (shellError) {
      dispatcher.onUnhandledError(shellError)
      dispatcher.openErrorOverlay()
    }
  }
})
