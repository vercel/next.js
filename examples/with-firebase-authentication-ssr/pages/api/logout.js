import cookiesMiddleware from 'utils/middleware/cookies'
import { AUTH_COOKIE_NAME } from 'utils/constants'

const handler = async (req, res) => {
  // An undefined value will delete the cookie.
  // https://github.com/pillarjs/cookies#cookiesset-name--value---options--
  req.cookie.set(AUTH_COOKIE_NAME, undefined)
  res.status(200).json({ status: true })
}

export default cookiesMiddleware(handler)
