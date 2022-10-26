import { appBootstrap } from './app-bootstrap'

// Include app-router and layout-router in the main chunk
require('next/dist/client/components/app-router')
require('next/dist/client/components/layout-router')
require('react')
require('next/dist/compiled/react-server-dom-webpack/client')

appBootstrap(() => {
  const { hydrate } = require('./app-index')
  hydrate()
})
