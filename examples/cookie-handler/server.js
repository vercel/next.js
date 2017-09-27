const express = require('express')
const next = require('next')
const cookieParser = require('cookie-parser')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const getName = (req, res, next) => {
  res.locals.name = req.cookies['name']
  next()
}

app.prepare()
.then(() => {
  const server = express()

  server.use(cookieParser())

  server.get('/', (req, res) => {
    const actualPage = '/'
    return app.render(req, res, actualPage)
  })

  server.get('/profile', getName, (req, res) => {
    const actualPage = '/profile'
    return app.render(req, res, actualPage)
  })

  server.get('/other', getName, (req, res) => {
    const actualPage = '/other'
    return app.render(req, res, actualPage)
  })

  server.get('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(3000, (err) => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
.catch((ex) => {
  console.error(ex.stack)
  process.exit(1)
})
