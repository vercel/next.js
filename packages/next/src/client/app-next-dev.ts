// TODO-APP: hydration warning

import './app-webpack'

import { renderAppDevOverlay } from 'next/dist/compiled/next-devtools'
import { appBootstrap } from './app-bootstrap'
import { getOwnerStack } from '../next-devtools/userspace/app/errors/stitched-error'
import { isRecoverableError } from './react-client-callbacks/on-recoverable-error'

// eslint-disable-next-line @next/internal/typechecked-require
const instrumentationHooks = require('../lib/require-instrumentation-client')

appBootstrap((assetPrefix) => {
  const enableCacheIndicator = process.env.__NEXT_CACHE_COMPONENTS

  // Instant Navigation Mode: When the server returned a partial static shell
  // (indicated by the __next_instant_test global), skip app hydration and only
  // render the dev overlay so the developer can toggle the mode off. Hydration
  // would fail because the static shell response doesn't include the full
  // Flight data stream.
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    if (self.__next_instant_test) {
      renderAppDevOverlay(
        getOwnerStack,
        isRecoverableError,
        enableCacheIndicator
      )
      return
    }
  }

  const { hydrate } = require('./app-index') as typeof import('./app-index')
  try {
    hydrate(instrumentationHooks, assetPrefix)
  } finally {
    renderAppDevOverlay(getOwnerStack, isRecoverableError, enableCacheIndicator)
  }
})
