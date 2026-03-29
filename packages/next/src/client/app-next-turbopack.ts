import './register-deployment-id-global'
import { appBootstrap } from './app-bootstrap'
import { isRecoverableError } from './react-client-callbacks/on-recoverable-error'

window.next.turbopack = true
;(self as any).__webpack_hash__ = ''

// eslint-disable-next-line @next/internal/typechecked-require
const instrumentationHooks = require('../lib/require-instrumentation-client')

appBootstrap((assetPrefix) => {
  const { hydrate, getPendingShellError } =
    require('./app-index') as typeof import('./app-index')
  try {
    hydrate(instrumentationHooks, assetPrefix)
  } finally {
    if (process.env.__NEXT_DEV_SERVER) {
      const enableCacheIndicator = process.env.__NEXT_CACHE_COMPONENTS
      const { getOwnerStack } =
        require('../next-devtools/userspace/app/errors/stitched-error') as typeof import('../next-devtools/userspace/app/errors/stitched-error')
      const { dispatcher, renderAppDevOverlay } =
        require('next/dist/compiled/next-devtools') as typeof import('next/dist/compiled/next-devtools')
      renderAppDevOverlay(
        getOwnerStack,
        isRecoverableError,
        enableCacheIndicator
      )

      // If the dev error shell was served, dispatch the embedded error to the
      // overlay after mounting it, and open the error overlay automatically
      // (app router defaults to overlay closed).
      const shellError = getPendingShellError()
      if (shellError) {
        dispatcher.onUnhandledError(shellError)
        dispatcher.openErrorOverlay()
      }
    }
  }
})
