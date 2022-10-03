import Iron from '@hapi/iron'
import { parse, serialize } from 'cookie'

export const COOKIE_NAME = 'session_token'

const TOKEN_SECRET = process.env.SESSION_TOKEN_SECRET!

export async function createCookieForSession(user: User) {
  // Make login session valid for 8 hours
  const maxAge = 60 * 60 * 8

  const expires = new Date()
  expires.setSeconds(expires.getSeconds() + maxAge)

  const sessionData: SessionData = { user, expiresAt: expires.toString() }

  const sessionToken = await Iron.seal(sessionData, TOKEN_SECRET, Iron.defaults)

  const cookie = serialize(COOKIE_NAME, sessionToken, {
    maxAge,
    expires,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    sameSite: 'lax',
  })

  return cookie
}

export async function getSessionFromCookie(cookie: string | undefined) {
  const cookies = parse(cookie ?? '')

  const sessionToken = cookies[COOKIE_NAME]

  if (!sessionToken) {
    return undefined
  }

  const sessionData: SessionData = await Iron.unseal(
    sessionToken,
    TOKEN_SECRET,
    Iron.defaults
  )

  return sessionData
}

export interface SessionData {
  user: User
  expiresAt: string
}

export interface User {
  userId: string
  email?: string
}
