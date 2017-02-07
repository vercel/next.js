const Koa = require('koa')
const next = require('next')
const Router = require('koa-router')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare()
.then(() => {
  const server = new Koa()
  const router = new Router()

  router.get('/a', function *() {
    app.render(this.req, this.res, '/b', this.query)
    this.respond = false
  })

  router.get('/b', function *() {
    app.render(this.req, this.res, '/a', this.query)
    this.respond = false
  })

  router.get('*', function *() {
    handle(this.req, this.res)
    this.respond = false
  })

  server.use(function *(next) {
    // Koa doesn't seems to set the default statusCode.
    // So, this middleware does that
    this.res.statusCode = 200
    yield next
  })

  server.use(router.routes())
  server.listen(3000, (err) => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
