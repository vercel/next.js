import express from 'express'
import passport from 'passport'
import { loginStrategy } from '../../lib/password-login'

const app = express()

app.disable('x-powered-by')

app.use(passport.initialize())

passport.use(loginStrategy)

app.post('/api/login', (req, res) => {
  // callbackURL is not in the options for the GitHub strategy, but it can be used
  passport.authenticate('local', { session: false }, (token, info) => {
    console.log('TOKEN', token, info)
    res.status(200).send({ done: true })
  })(req, res)
})

export default app
