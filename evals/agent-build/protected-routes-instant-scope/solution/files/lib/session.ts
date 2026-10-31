import { io } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifySession, type Session } from '@/lib/vendor/session-sdk'

export const SESSION_COOKIE = 'ledger_session'

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  // The SDK compares the expiry with the clock; keep that out of the prerender.
  await io()
  return verifySession(token)
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}
