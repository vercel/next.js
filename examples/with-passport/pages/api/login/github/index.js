import url from 'url'
import express from 'express'
import passport from 'passport'
import { githubStrategy, callbackURL } from '../../../../lib/passport/github'

const app = express()

app.disable('x-powered-by')

app.use(passport.initialize())

passport.use(githubStrategy)

app.get('/api/login/github', (req, res) => {
  // This is the path used to redirect the user after a successful login
  const { redirectPath } = req.query
  const redirectTo = url.parse(callbackURL, true)

  redirectTo.query.redirectPath = url.format(redirectPath)

  passport.authenticate('github', { callbackURL: url.format(redirectTo) })(
    req,
    res
  )
})

export default app
