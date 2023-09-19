// TODO-APP: hydration warning

import { appBootstrap } from './app-bootstrap'

appBootstrap(() => {
  require('./app-webpack')
  const { hydrate } = require('./app-index')
  hydrate()
})

// TODO-APP: build indicator
