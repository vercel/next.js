import nextConnect from 'next-connect';
import auth from '../../middleware/auth';
import passport from '../../lib/passport';

const handler = nextConnect();

handler.use(auth).post(passport.authenticate('local'), (req, res) => {
  if (req.user) {
    // For demo purpose only. See pages/api/posts/
    req.session.posts = [];
  }
  res.json({ user: req.user });
});

export default handler;
