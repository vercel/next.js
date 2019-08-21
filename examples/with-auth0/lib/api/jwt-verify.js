import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'

const audience = process.env.AUTH0_AUDIENCE
const jwtOptions = {
  algorithms: ['RS256'],
  maxAge: '1 day'
}

// Create a client to retrieve secret keys
const client = jwksClient({
  jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
})

// Retrieves the secret keys
function getSigningKey (header, cb) {
  client.getSigningKey(header.kid, (error, key) => {
    if (error) cb(error)
    else cb(null, key.publicKey || key.rsaPublicKey)
  })
}

export class AuthError extends Error {
  constructor (status, message) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

// Verifies a JWT
export const verify = (token, options) =>
  new Promise((resolve, reject) => {
    const opts = { ...options, ...jwtOptions }

    jwt.verify(token, getSigningKey, opts, (error, payload) => {
      if (error) reject(error)
      else resolve(payload)
    })
  })

export const verifyRequest = async req => {
  const accessToken = req.cookies.access_token
  const idToken = req.cookies.id_token

  if (!accessToken || !idToken) {
    throw new AuthError(401, 'You are not allowed to be here')
  }

  return {
    accessToken: await verify(accessToken, { audience }),
    // You could also verify id_token too, is currently commented because its `exp` is way before access_token
    // idToken: await verify(idToken),
    idToken: jwt.decode(idToken)
  }
}
