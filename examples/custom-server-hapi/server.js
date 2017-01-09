const next = require('next')
const Hapi = require('hapi')
const { pathWrapper, defaultHandlerWrapper } = require('./next-wrapper')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const server = new Hapi.Server()

app.prepare()
.then(() => {
  server.connection({ port: 3000 })

  server.route({
    method: 'GET',
    path: '/a',
    handler: pathWrapper(app, '/a')
  })

  server.route({
    method: 'GET',
    path: '/b',
    handler: pathWrapper(app, '/b')
  })

  server.route({
    method: 'GET',
    path: '/{p*}', /* catch all route */
    handler: defaultHandlerWrapper(app)
  })

  server.start().catch(error => {
    console.log('Error starting server')
    console.log(error)
  }).then(() => {
    console.log('> Ready on http://localhost:3000')
  })
})
