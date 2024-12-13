import { cookies } from 'next/headers'
import { unauthorized } from 'next/navigation'

export class AuthError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AuthError'
  }
}

export class SessionExpiredError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AuthError'
  }
}

export async function verifyAuth() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')

  if (!token) {
    unauthorized(new AuthError('No token found'))
  }

  if (token.value === 'expired') {
    unauthorized(new SessionExpiredError('Session expired'))
  }
}
