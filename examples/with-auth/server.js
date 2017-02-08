const express = require('express')
const session = require('express-session')
const bodyParser = require('body-parser')
const next = require('next')
const auth = require('./auth')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dir: '.', dev })
const handle = app.getRequestHandler()

app.prepare()
.then(() => {
  const server = express()

  server.use(bodyParser.json())
  server.use(session({ secret: 'Meow', resave: false, saveUninitialized: true }))
  server.use(auth.sessionSupport())
  server.use(auth.acceptToken({ successRedirect: '/' }))

  server.post('/sendtoken', auth.requestToken((email, delivery, fn) =>
  fn(null, email)), (req, res) => res.json('ok'))

  server.get('/me', (req, res) => res.json(req.user || null))

  server.post('/logout', (req, res) => req.session.destroy(() => res.json('ok')))

  server.get('*', (req, res) => handle(req, res))

  server.listen(3000, err => {
    if (err) throw err
    console.log('> Next-auth ready on http://localhost:3000')
  })
})
