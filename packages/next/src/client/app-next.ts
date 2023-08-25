import { appBootstrap } from './app-bootstrap'

appBootstrap(() => {
  // Include app-router and layout-router in the main chunk
  require('./app-webpack')
  // It is import that the webpack patch above in ./app-webpack runs before any
  // react code is loaded. This order dependent loading will ensure that react controls
  // the filename resolution of flight loaded chunks and will not be intercepted
  // by the patch above.
  require('next/dist/client/components/app-router')
  require('next/dist/client/components/layout-router')
  const { hydrate } = require('./app-index')
  hydrate()
})
