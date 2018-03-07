const axios = require('axios')
const express = require('express')
const cookieParser = require('cookie-parser')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'

const AUTHENTICATED_TYPE = 'authenticated'
const COOKIE_SECRET = 'some deep dark secret'
const COOKIE_OPTIONS = {
  // domain: 'YOU_DOMAIN',
  path: '/',
  secure: !dev,
  httpOnly: true,
  signed: true
}

// fake serverless authentication
const authenticate = async (email, password) => {
  const users = await axios.get('https://jsonplaceholder.typicode.com/users').then(response => response.data)
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase())
  if (user && user.website === password) {
    return user
  }
}

const port = parseInt(process.env.PORT, 10) || 3000
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare()
  .then(() => {
    const server = express()

    server.use(express.json())

    server.use(cookieParser(COOKIE_SECRET))

    server.post('/api/login', async (req, res) => {
      const { email, password } = req.body || {}
      const user = await authenticate(email, password)
      if (!user) {
        return res.status(403).send('Invalid email or password')
      }
      const info = {
        email: user.email,
        name: user.name,
        type: AUTHENTICATED_TYPE
      }
      res.cookie('token', info, COOKIE_OPTIONS)
      return res.status(200).json(info)
    })

    server.post('/api/logout', (req, res) => {
      res.clearCookie('token', COOKIE_OPTIONS)
      return res.sendStatus(204)
    })

    server.get('/api/profile', async (req, res) => {
      const { signedCookies = {} } = req
      const { token = '' } = signedCookies
      if (token && token.email) {
        const users = await axios.get('https://jsonplaceholder.typicode.com/users').then(response => response.data)
        const user = users.find(u => u.email.toLowerCase() === token.email.toLowerCase())
        return res.status(200).json({ user })
      }
      return res.sendStatus(404)
    })

    server.get('*', (req, res) => {
      return handle(req, res)
    })

    server.listen(port, (err) => {
      if (err) throw err
      console.log(`> Ready on http://localhost:${port}`)
    })
  })
