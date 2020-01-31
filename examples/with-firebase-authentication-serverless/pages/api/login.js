import commonMiddleware from '../../utils/middleware/commonMiddleware'
import { verifyIdToken } from '../../utils/auth/firebaseAdmin'

const handler = (req, res) => {
  if (!req.body) {
    return res.status(400)
  }

  const { token } = req.body

  // Here, we decode the user's Firebase token and store it in a cookie. Use
  // express-session (or similar) to store the session data server-side.
  // An alternative approach is to use Firebase's `createSessionCookie`. See:
  // https://firebase.google.com/docs/auth/admin/manage-cookies
  // Firebase docs:
  //   "This is a low overhead operation. The public certificates are initially
  //    queried and cached until they expire. Session cookie verification can be
  //    done with the cached public certificates without any additional network
  //    requests."
  // However, in a serverless environment, we shouldn't rely on caching, so
  // it's possible Firebase's `verifySessionCookie` will make frequent network
  // requests in a serverless context.
  return verifyIdToken(token)
    .then(decodedToken => {
      req.session.decodedToken = decodedToken
      req.session.token = token
      return decodedToken
    })
    .then(decodedToken => {
      return res.status(200).json({ status: true, decodedToken })
    })
    .catch(error => {
      return res.status(500).json({ error })
    })
}

export default commonMiddleware(handler)
