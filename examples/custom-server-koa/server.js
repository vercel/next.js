const Koa = require('koa')
const Router = require('@koa/router')
const { handleRoutes, defaultReturn, render } = require('nextjs-koa-middleware')

const port = parseInt(process.env.PORT, 10) || 3000

const app = new Koa()

const router = new Router()

app.use(defaultReturn())

router.get('/a', render('/a'))
router.get('/b', render('/b'))

router.all('*', handleRoutes())

app.use(router.routes())
app.listen(port, () => {
  console.log(`> Ready on http://localhost:${port}`)
})
