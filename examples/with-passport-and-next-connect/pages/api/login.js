import nextConnect from 'next-connect'
import auth from '../../middleware/auth'
import passport from '../../lib/passport'

const handler = nextConnect()

handler.use(auth).post(passport.authenticate('local'), (req, res) => {
  if (req.user) {
    // For demo purpose only.
    // We will store the posts in session. You would normally store posts in the database
    req.session.posts = []
  }
  res.json({ user: req.user })
})

export default handler
