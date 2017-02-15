// Configure a database to store user profiles and email sign in tokens
// Database connection string for ORM (e.g. MongoDB/Amazon Redshift/SQL DB…)
// By default it uses SQL Lite to create a DB in /tmp/nextjs-auth.db
process.env.DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING || 'sqlite:///tmp/nextjs-auth.db'

// Secret used to encrypt session data stored on the server
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'change-me'

const express = require('express')
const next = require('next')
const orm = require('orm')
const auth = require('./routes/auth')

const dev = process.env.NODE_ENV !== 'production'
const app = next({
  dir: '.',
  dev
})

const handle = app.getRequestHandler()

app.prepare()
.then(() => {
  // Get instance of Express server
  const server = express()

  // Set it up the database (used to store user info and email sign in tokens)
  return new Promise((resolve, reject) => {
    // Before we can set up authentication routes we need to set up a database
    orm.connect(process.env.DB_CONNECTION_STRING, function (err, db) {
      if (err) {
        return reject(err)
      }

      // Define our user object
      // * If adding a new oauth provider, add a field to store account id
      // * Tokens are single use but don't expire & we don't save verified date
      db.define('user', {
        name: {type: 'text'},
        email: {type: 'text', unique: true},
        token: {type: 'text', unique: true},
        verified: {type: 'boolean', defaultValue: false},
        facebook: {type: 'text'},
        google: {type: 'text'},
        twitter: {type: 'text'}
      })

      // Creates require tables/collections on DB
      // Note: If you add fields to am object this won't do that for you, it
      // only creates tables/collections if they are not there - you still need
      // to handle database schema changes yourself.
      db.sync(function (err) {
        if (err) {
          return reject(err)
        }
        return resolve({ db, server })
      })
    })
  })
})
.then(({ server, db }) => {
  // Once DB is available, setup sessions and routes for authentication
  auth.configure({
    app: app,
    server: server,
    user: db.models.user,
    secret: process.env.SESSION_SECRET,
    mailserver: {
      // nodemailer settings
    }
  })

  // Default catch-all handler to allow Next.js to handle all other routes
  server.all('*', (req, res) => {
    return handle(req, res)
  })

  // Set vary header (good practice)
  // Note: This overrides any existing 'Vary' header but is okay in this app
  server.use(function (req, res, next) {
    res.setHeader('Vary', 'Accept-Encoding')
    next()
  })

  server.listen(process.env.PORT || 3000, err => {
    if (err) {
      throw err
    }
    console.log('> Ready on http://localhost:' + process.env.PORT)
  })
})
.catch(err => {
  console.log('An error occurred, unable to start the server')
  console.log(err)
})
