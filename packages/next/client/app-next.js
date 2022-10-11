import { appBootstrap } from './app-bootstrap'

appBootstrap(() => {
  // Include app-router and layout-router in the main chunk
  import('next/dist/client/components/app-router.client.js')
  import('next/dist/client/components/layout-router.client.js')

  const { hydrate } = require('./app-index')
  hydrate()
})
