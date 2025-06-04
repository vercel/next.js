// TODO-APP: hydration warning

import { appBootstrap } from './app-bootstrap'

window.next.version += '-turbo'
;(self as any).__webpack_hash__ = ''

const instrumentationHooks = require('../lib/require-instrumentation-client')

appBootstrap(() => {
  const { hydrate } = require('./app-index')
  hydrate(instrumentationHooks)
})
