/**
 * This is the runtime entry point for Next.js App Router client-side bundles.
 */

import '../shims'
import { appBootstrap } from 'next/dist/client/app-bootstrap'

appBootstrap(() => {
  require('./app-turbopack')
  const { hydrate } = require('./app-index')
  hydrate()
})
