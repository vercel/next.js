const express = require('express')
const next = require('next')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')

const verifyJWT = token => {
  return new Promise(resolve => {
    resolve(jwt.verify(token, 'secret account key'))
  })
}

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })

app.prepare()
.then(() => {
  const server = express()

  server.use(cookieParser())

  server.use(async (req, res, next) => {
    try {
      await verifyJWT(req.cookies['id_token'])
      res.locals.logged = true
    } catch (err) {
      res.locals.logged = false
    }
    next()
  })

  server.get('/', (req, res) => {
    const actualPage = '/'
    const logged = res.locals.logged
    if (logged) {
      return res.redirect('/profile')
    }
    return app.render(req, res, actualPage)
  })

  server.get('/signUp', (req, res) => {
    const actualPage = '/signUp'
    const logged = res.locals.logged
    if (logged) {
      return res.redirect('/profile')
    }
    return app.render(req, res, actualPage)
  })

  server.get('/profile', (req, res) => {
    const actualPage = '/profile'
    const logged = res.locals.logged
    if (logged) {
      return app.render(req, res, actualPage)
    }
    return res.redirect('/')
  })

  server.get('/other', (req, res) => {
    const actualPage = '/other'
    const logged = res.locals.logged
    if (logged) {
      return app.render(req, res, actualPage)
    }
    return res.redirect('/')
  })

  server.get('*', (req, res) => {
    app.render(req, res)
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
