const express = require('express')
const bodyParser = require('body-parser')
const session = require('express-session')
const FileStore = require('session-file-store')(session);
const next = require('next')
const admin = require('firebase-admin')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const serviceAccount = require('./firebase')
const firebase = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://log-me-in-b7816.firebaseio.com",
})

app.prepare()
.then(() => {
  const server = express()

  server.use(bodyParser.json())
  server.use(session({
    secret: 'geheimnis',
    saveUninitialized: true,
    store: new FileStore({path: '/tmp/sessions', secret: 'geheimnis'}),
    resave: false,
    rolling: true,
    httpOnly: true,
    cookie: { maxAge: 604800000 } // week
  }))

  server.get('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(3000, (err) => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
