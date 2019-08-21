import qs from 'qs'
import cookie from 'cookie'
import jwt from 'jsonwebtoken'
import fetch from 'isomorphic-unfetch'
import { getCookieOptions } from '../../../lib/api/auth-utils'

const url = `https://${process.env.AUTH0_DOMAIN}/oauth/token`
const fetchOptions = code => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: qs.stringify({
    grant_type: 'authorization_code',
    client_id: process.env.AUTH0_CLIENT_ID,
    client_secret: process.env.AUTH0_CLIENT_SECRET,
    redirect_uri: `${process.env.AUTH0_REDIRECT_URI}/api/auth/callback/`,
    code
  })
})

function validateTokens (data) {
  if (data && data.id_token && data.access_token) {
    return data
  }
  throw new Error('Invalid credentials')
}

export default async (req, res) => {
  const { state, nonce } = req.cookies
  const { state: incomingState, code } = req.query

  try {
    // confirm state match to mitigate CSRF
    if (state !== incomingState) {
      throw new Error('State mismatch, CSRF attack likely.')
    }

    const response = await fetch(url, fetchOptions(code))

    if (response.ok) {
      const data = validateTokens(await response.json())
      const user = jwt.decode(data.id_token)

      if (nonce !== user.nonce) {
        throw new Error(
          'Nonce mismatch, potential token replay attack underway.'
        )
      }

      res.setHeader('Set-Cookie', [
        cookie.serialize('id_token', data.id_token, getCookieOptions()),
        cookie.serialize(
          'access_token',
          data.access_token,
          getCookieOptions({ httpOnly: true })
        ),
        // Clear unrequired cookies
        cookie.serialize('state', '', { maxAge: 0, path: '/' }),
        cookie.serialize('nonce', '', { maxAge: 0, path: '/' })
      ])

      res.writeHead(302, { Location: '/' })
      res.end()
    } else {
      const error = new Error(response.statusText)
      error.status = response.status
      throw error
    }
  } catch (error) {
    console.error(error)
    res.status(error.status || 400).end(error.message)
  }
}
