import express from 'express'
import passport from 'passport'
import { localStrategy } from '../../lib/password-local'
import { encryptSession } from '../../lib/iron'
import { setTokenCookie } from '../../lib/auth-cookies'

const app = express()
const authenticate = (method, req, res) =>
  new Promise((resolve, reject) => {
    passport.authenticate(method, { session: false }, (error, token) => {
      if (error) {
        reject(error)
      } else {
        resolve(token)
      }
    })(req, res)
  })

app.disable('x-powered-by')

app.use(passport.initialize())

passport.use(localStrategy)

app.post('/api/login', async (req, res) => {
  try {
    const user = await authenticate('local', req, res)
    // session is the payload to save in the token, it may contain basic info about the user
    const session = { ...user }
    // The token is a string with the encrypted session
    const token = await encryptSession(session)

    setTokenCookie(res, token)
    res.status(200).send({ done: true })
  } catch (error) {
    console.error(error)
    res.status(401).send(error.message)
  }
})

export default app
