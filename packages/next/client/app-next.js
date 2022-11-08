import { appBootstrap } from './app-bootstrap'

appBootstrap(() => {
  // Include app-router and layout-router in the main chunk
  require('next/dist/client/components/app-router')
  require('next/dist/client/components/layout-router')
  const { hydrate } = require('./app-index')
  hydrate()
})
