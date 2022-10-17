import { appBootstrap } from './app-bootstrap'

appBootstrap(() => {
  // Include app-router and layout-router in the main chunk
  import('next/dist/client/components/app-router.js')
  import('next/dist/client/components/layout-router.js')

  const { hydrate } = require('./app-index')
  hydrate()
})
