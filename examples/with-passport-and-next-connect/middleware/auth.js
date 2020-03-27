import cookieSession from 'cookie-session'
import nextConnect from 'next-connect'
import passport from '../lib/passport'

const auth = nextConnect()
  .use(
    cookieSession({
      name: 'session',
      keys: ['hackme'],
    })
  )
  .use(passport.initialize())
  .use(passport.session())

export default auth
