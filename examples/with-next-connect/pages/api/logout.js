import nextConnect from 'next-connect';
import auth from '../../middleware/auth';
import passport from '../../lib/passport';

const handler = nextConnect();

handler.use(auth).get((req, res) => {
  req.logOut();
  res.status(204).end();
});

export default handler;
