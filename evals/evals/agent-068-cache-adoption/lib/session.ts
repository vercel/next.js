import { cookies } from 'next/headers'

export type Session = { userId: string } | null

// The session cookie holds the signed-in customer's user id.
export async function getSession(): Promise<Session> {
  const store = await cookies()
  const value = store.get('session')?.value
  if (!value) return null
  return { userId: value }
}
