const next = require('next')
const Hapi = require('@hapi/hapi')
const {
  pathWrapper,
  defaultHandlerWrapper,
  nextHandlerWrapper,
} = require('./next-wrapper')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const server = new Hapi.Server({
  port,
})

app.prepare().then(async () => {
  server.route({
    method: 'GET',
    path: '/a',
    handler: pathWrapper(app, '/a'),
  })

  server.route({
    method: 'GET',
    path: '/b',
    handler: pathWrapper(app, '/b'),
  })

  server.route({
    method: 'GET',
    path: '/_next/{p*}' /* next specific routes */,
    handler: nextHandlerWrapper(app),
  })

  server.route({
    method: 'GET',
    path: '/static/{p*}' /* use next to handle static files */,
    handler: nextHandlerWrapper(app),
  })

  server.route({
    method: '*',
    path: '/{p*}' /* catch all route */,
    handler: defaultHandlerWrapper(app),
  })

  try {
    await server.start()
    console.log(`> Ready on http://localhost:${port}`)
  } catch (error) {
    console.log('Error starting server')
    console.log(error)
  }
})
