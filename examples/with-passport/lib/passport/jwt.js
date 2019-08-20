import jwt from 'jsonwebtoken'
import { ROOT_URL } from '../configs'

const SECRET = process.env.ACCESS_TOKEN_SECRET
const algorithm = 'HS256'
const verityOptions = {
  audience: ROOT_URL,
  algorithms: [algorithm]
}

export class AuthError extends Error {
  constructor (status, message) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

export const createJwt = ({ id, provider, displayName, username }) => {
  const payload = {
    id,
    provider,
    displayName,
    username,
    expiresIn: '30d',
    aud: ROOT_URL,
    iat: Math.floor(Date.now() / 1000)
  }
  return jwt.sign(payload, SECRET, { algorithm })
}

export const verifyJwt = token =>
  new Promise((resolve, reject) => {
    jwt.verify(token, SECRET, verityOptions, (error, payload) => {
      if (error) reject(error)
      else resolve(payload)
    })
  })

export const authenticate = req => {
  const { authorization } = req.headers

  if (!authorization) {
    throw new AuthError(401, 'The authorization header is missing')
  }

  const [scheme, token] = authorization.split(' ')
  const isBearer = scheme && scheme.toLowerCase() === 'bearer'

  if (!isBearer || !token) {
    throw new AuthError(401, 'The authorization header is invalid')
  }

  return verifyJwt(token)
}
