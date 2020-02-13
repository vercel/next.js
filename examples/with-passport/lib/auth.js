import Iron from '@hapi/iron'
import { getTokenCookie } from './auth-cookies'

// Use an environment variable here instead of a hardcoded value in a production environment
const TOKEN_SECRET = 'this-is-a-secret-value-with-at-least-32-characters'

export function encryptSession(session) {
  return Iron.seal(session, TOKEN_SECRET, Iron.defaults)
}

export async function getSession(req) {
  const token = getTokenCookie(req)
  const session = await Iron.unseal(token, TOKEN_SECRET, Iron.defaults)

  return Iron.unseal(session, TOKEN_SECRET, Iron.defaults)
}
