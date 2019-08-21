import url from 'url'
import cookie from 'cookie'
import nanoid from 'nanoid'
import {
  getAuth0RedirectUrl,
  getCookieOptions
} from '../../../lib/api/auth-utils'

// Returns the Authorization URL:
// https://auth0.com/docs/flows/guides/auth-code/call-api-auth-code#example-authorization-url
const getAuthorizeUrl = (state, nonce, redirectPath) => {
  const domain = process.env.AUTH0_DOMAIN
  const authorizeUrl = url.parse(`https://${domain}/authorize`, true)

  authorizeUrl.query.response_type = 'code'
  authorizeUrl.query.audience = process.env.AUTH0_AUDIENCE
  authorizeUrl.query.client_id = process.env.AUTH0_CLIENT_ID
  authorizeUrl.query.redirect_uri = getAuth0RedirectUrl(
    process.env.AUTH0_REDIRECT_URI,
    redirectPath
  )
  authorizeUrl.query.scope = 'openid profile'
  authorizeUrl.query.state = state
  authorizeUrl.query.nonce = nonce

  return url.format(authorizeUrl)
}

export default async (req, res) => {
  // This is the path used to redirect the user after a successful login
  const { redirectPath } = req.query
  // Generate random opaque value for state
  const state = nanoid()
  // https://auth0.com/docs/api-auth/tutorials/nonce
  const nonce = nanoid()
  const options = { httpOnly: true, sameSite: false }

  // Add state and nonce cookies for /login/callback to check
  res.setHeader('Set-Cookie', [
    cookie.serialize('state', state, getCookieOptions(options)),
    cookie.serialize('nonce', nonce, getCookieOptions(options))
  ])

  const authorizeUrl = getAuthorizeUrl(state, nonce, redirectPath)

  // Redirect to Auth0
  res.writeHead(302, { Location: authorizeUrl })
  res.end()
}
