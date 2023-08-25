// TODO-APP: hydration warning

import { appBootstrap } from './app-bootstrap'

appBootstrap(() => {
  require('./app-webpack')
  // It is import that the webpack patch above in ./app-webpack runs before any
  // react code is loaded. This order dependent loading will ensure that react controls
  // the filename resolution of flight loaded chunks and will not be intercepted
  // by the patch above.
  const { hydrate } = require('./app-index')
  hydrate()
})

// TODO-APP: build indicator
