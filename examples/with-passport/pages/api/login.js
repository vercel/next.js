import express from 'express'
import passport from 'passport'
import { serialize } from 'cookie'
import { localStrategy } from '../../lib/password-login'

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
    const token = await authenticate('local', req, res)
    const maxAge = 60 * 60 * 8 // 8 hours
    const cookie = serialize('token', token, {
      maxAge,
      expires: new Date(Date.now() + maxAge * 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
    })

    res.setHeader('Set-Cookie', cookie)
    res.status(200).send({ done: true })
  } catch (error) {
    console.error(error)
    res.status(401).send(error.message)
  }
})

export default app
