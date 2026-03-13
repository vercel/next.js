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
  try {
    hydrate(instrumentationHooks, assetPrefix)
  } finally {
    if (process.env.__NEXT_DEV_SERVER || process.env.__NEXT_DEVTOOLS_IN_PROD) {
      const enableCacheIndicator = process.env.__NEXT_CACHE_COMPONENTS
      const { getOwnerStack } =
        require('../next-devtools/userspace/app/errors/stitched-error') as typeof import('../next-devtools/userspace/app/errors/stitched-error')
      const { renderAppDevOverlay } =
        require('next/dist/compiled/next-devtools') as typeof import('next/dist/compiled/next-devtools')
      const { isRecoverableError } =
        require('./react-client-callbacks/on-recoverable-error') as typeof import('./react-client-callbacks/on-recoverable-error')

      renderAppDevOverlay(
        getOwnerStack,
        isRecoverableError,
        enableCacheIndicator
      )
    }
  }
})
