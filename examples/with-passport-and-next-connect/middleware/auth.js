import nextConnect from 'next-connect'
import passport from '../lib/passport'
import session from '../lib/session'

const auth = nextConnect()
  .use(
    session({
      name: 'sess',
      secret: 'some_not_random_password_that_is_at_least_32_characters', // This should be kept securely, preferably in env vars
      cookie: {
        maxAge: 60 * 60 * 8, // 8 hours,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        sameSite: 'lax',
      },
    })
  )
  .use((req, res, next) => {
    // Initialize mocked database
    // Remove this after you add your own database
    req.session.users = req.session.users || []
    next()
  })
  .use(passport.initialize())
  .use(passport.session())

export default auth
