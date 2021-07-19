const fastify = require('fastify')({
  logger: { level: 'error' },
  pluginTimeout: 0,
})
const Next = require('next')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'

fastify.register((fastify, opts, next) => {
  const app = Next({ dev })
  const handle = app.getRequestHandler()
  app
    .prepare()
    .then(() => {
      if (dev) {
        fastify.get('/_next/*', (req, reply) => {
          return handle(req.raw, reply.raw).then(() => {
            reply.sent = true
          })
        })
      }

      fastify.get('/a', (req, reply) => {
        return app.render(req.raw, reply.raw, '/a', req.query).then(() => {
          reply.sent = true
        })
      })

      fastify.get('/b', (req, reply) => {
        return app.render(req.raw, reply.raw, '/b', req.query).then(() => {
          reply.sent = true
        })
      })

      fastify.all('/*', (req, reply) => {
        return handle(req.raw, reply.raw).then(() => {
          reply.sent = true
        })
      })

      fastify.setNotFoundHandler((request, reply) => {
        return app.render404(request.raw, reply.raw).then(() => {
          reply.sent = true
        })
      })

      next()
    })
    .catch((err) => next(err))
})

fastify.listen(port, (err) => {
  if (err) throw err
  console.log(`> Ready on http://localhost:${port}`)
})
