import cookiesMiddleware from 'utils/middleware/cookies'
import { getCustomIdAndRefreshTokens } from 'utils/auth/firebaseAdmin'
import { AUTH_COOKIE_NAME } from 'utils/constants'

const handler = async (req, res) => {
  if (!(req.headers && req.headers.authorization)) {
    return res.status(400).json({ error: 'Missing Authorization header value' })
  }

  // This should be the original Firebase ID token from
  // the Firebase JS SDK.
  const token = req.headers.authorization

  // Get a custom ID token and refresh token, given a valid
  // Firebase ID token.
  const { idToken, refreshToken } = await getCustomIdAndRefreshTokens(token)

  // Store the ID and refresh tokens in a cookie. This
  // cookie will be available to future requests to pages,
  // providing a valid Firebase ID token for server-side rendering.
  req.cookie.set(
    AUTH_COOKIE_NAME,
    JSON.stringify({
      idToken,
      refreshToken,
    })
  )

  return res.status(200).json({ status: true })
}

export default cookiesMiddleware(handler)
