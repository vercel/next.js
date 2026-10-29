import { cookies } from 'next/headers'
import { cacheLife } from 'next/cache'
import { redirect } from 'next/navigation'
import { verifySession, type Session } from '@/lib/vendor/session-sdk'

export const SESSION_COOKIE = 'ledger_session'

// Request-time session read. Reads cookies(), so callers must keep it behind a
// <Suspense> boundary; it can't be part of the static shell directly.
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySession(token)
}

// Session read used by the workspace shell. Cached privately per session in
// the browser, so a warm App Shell carries it and navigations are instant.
// Proxy already redirects signed-out requests to /login before rendering;
// the redirect here is defense in depth for any in-app (RSC) navigation.
export async function getCurrentSession(): Promise<Session> {
  'use cache: private'
  cacheLife({ stale: 300 })

  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const session = token ? await verifySession(token) : null
  if (!session) {
    redirect('/login')
  }
  return session
}
