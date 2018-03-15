const express = require('express')
const next = require('next')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')

const dev = process.env.NODE_ENV !== 'production'
const port = process.env.PORT || 3000
const app = next({ dev })
const handle = app.getRequestHandler()

const dummyUserDatabase = {
  'user@example.com': {
    id: 1,
    password: 'changeme',
    firstName: 'Test',
    lastName: 'User',
    groups: []
  },
  'staff@example.com': {
    id: 2,
    password: 'changeme',
    firstName: 'Staff',
    lastName: 'User',
    groups: ['STAFF']
  }
}

app.prepare()
  .then(() => {
    const server = express()

    server.use(cookieParser())

    server.use(bodyParser.urlencoded({ extended: true }))

    server.use(bodyParser.json())

    // Dummy login backend
    server.post('/api/login', (req, res) => {
      const {username, password} = req.body
      if (password === 'changeme' && dummyUserDatabase.hasOwnProperty(username)) {
        const user = dummyUserDatabase[username]
        res.cookie('session_id', user.id, { expires: new Date(Date.now() + 900000), httpOnly: true })
        res.send(user)
      } else {
        res.status(400).send({
          message: 'Wrong username and/or password.'
        })
      }
    })

    // Removes the session cookie and sends an empty response
    server.get('/api/logout', (req, res) => {
      res.clearCookie('session_id')
      res.send({})
    })

    // Returns the current logged in user or 404 based on the session cookie.
    // This is called server side the first page load.
    server.get('/api/whoami', (req, res) => {
      if (req.cookies.hasOwnProperty('session_id')) {
        const sessionId = parseInt(req.cookies.session_id, 10)
        let user
        for (let username in dummyUserDatabase) {
          if (dummyUserDatabase[username].id === sessionId) {
            user = dummyUserDatabase[username]
            break
          }
        }
        res.send(user)
      } else {
        res.status(404).send()
      }
    })

    server.get('*', (req, res) => handle(req, res))

    server.listen(port, (err) => {
      if (err) throw err
      console.log('> Ready on http://localhost:' + port)
    })
  })
  .catch((ex) => {
    console.error(ex.stack)
    process.exit(1)
  })
