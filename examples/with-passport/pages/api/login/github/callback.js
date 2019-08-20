import url from 'url'
import express from 'express'
import passport from 'passport'
import { ROOT_URL } from '../../../../lib/configs'
import { githubStrategy } from '../../../../lib/passport/github'

const app = express()
const isProd = process.env.NODE_ENV === 'production'

app.disable('x-powered-by')

app.use(passport.initialize())

passport.use(githubStrategy)

app.get('/api/login/github/callback', (req, res) => {
  passport.authenticate('github', (err, data) => {
    if (err) {
      console.error(err)
      res.status(500).send('Login with Github failed')
    } else {
      let redirectTo = url.parse(ROOT_URL + req.query.redirectPath, true)

      // Handle invalid redirectPath
      if (!redirectTo || !redirectTo.hostname) {
        redirectTo = url.parse(ROOT_URL)
      }

      res.cookie('loginToken', data.accessToken, {
        path: '/',
        secure: isProd,
        maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
      })
      res.redirect(url.format(redirectTo))
    }
  })(req, res)
})

export default app
