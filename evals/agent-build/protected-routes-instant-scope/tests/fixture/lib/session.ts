import { cookies } from 'next/headers'
import { verifySession, type Session } from '@/lib/vendor/session-sdk'

export const SESSION_COOKIE = 'ledger_session'

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySession(token)
}
