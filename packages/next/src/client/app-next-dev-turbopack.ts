// TODO-APP: hydration warning

import { appBootstrap } from './app-bootstrap'

window.next.version += '-turbo'

appBootstrap(() => {
  require('./app-turbopack')
  const { hydrate } = require('./app-index')
  hydrate()
})

// TODO-APP: build indicator
