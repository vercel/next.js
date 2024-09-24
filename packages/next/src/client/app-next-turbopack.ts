// TODO-APP: hydration warning

import { appBootstrap } from './app-bootstrap'

window.next.version += '-turbo'
;(self as any).__webpack_hash__ = ''

appBootstrap(() => {
  const { hydrate } = require('./app-index')
  hydrate()
})

// TODO-APP: build indicator
