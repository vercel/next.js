import { cookies } from 'next/headers'
import { setCurrentUser } from './request-context'

export interface Session {
  userId: string
  company: string
}

// The auth proxy sets the session cookie as "<userId>@<company>".
export async function loadSession(): Promise<Session> {
  const jar = await cookies()
  const raw = jar.get('session')?.value ?? 'guest@demo'
  const at = raw.indexOf('@')
  const session: Session =
    at === -1
      ? { userId: raw, company: 'demo' }
      : { userId: raw.slice(0, at), company: raw.slice(at + 1) }
  setCurrentUser(session)
  return session
}
