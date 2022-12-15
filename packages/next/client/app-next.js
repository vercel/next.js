import { appBootstrap } from './app-bootstrap'

appBootstrap(() => {
  // Include app-router and layout-router in the main chunk
  require('next/dist/client/components/app-router')
  require('next/dist/client/components/layout-router')
  require('next/dist/client/components/error-boundary')
  const { hydrate } = require('./app-index')
  hydrate()
})
