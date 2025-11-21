import { appBootstrap } from './app-bootstrap'
import { isRecoverableError } from './react-client-callbacks/on-recoverable-error'

window.next.turbopack = true
;(self as any).__webpack_hash__ = ''

// eslint-disable-next-line @next/internal/typechecked-require
const instrumentationHooks = require('../lib/require-instrumentation-client')

appBootstrap((assetPrefix) => {
  const { hydrate } = require('./app-index') as typeof import('./app-index')
  try {
    hydrate(instrumentationHooks, assetPrefix)
  } finally {
    if (process.env.NODE_ENV !== 'production') {
      const enableCacheIndicator = process.env.__NEXT_CACHE_COMPONENTS
      const { getOwnerStack } =
        require('../next-devtools/userspace/app/errors/stitched-error') as typeof import('../next-devtools/userspace/app/errors/stitched-error')
      const { renderAppDevOverlay } =
        require('next/dist/compiled/next-devtools') as typeof import('next/dist/compiled/next-devtools')
      renderAppDevOverlay(
        getOwnerStack,
        isRecoverableError,
        enableCacheIndicator
      )
    }
  }
})
