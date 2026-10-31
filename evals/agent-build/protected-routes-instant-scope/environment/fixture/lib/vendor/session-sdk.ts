// Vendored copy of @ledger/session-sdk 2.1.0. Do not edit; upgrade instead.
//
// Sessions are opaque tokens looked up in the session store. Every lookup
// checks the expiry against the current clock.

export type Session = {
  userId: string
  name: string
  teamId: string
  teamName: string
  expiresAt: number
}

const store: Record<string, Session> = {
  tok_ada: {
    userId: 'ada',
    name: 'Ada Lovelace',
    teamId: 'analytical-engines',
    teamName: 'Analytical Engines',
    expiresAt: Date.UTC(2031, 0, 1),
  },
  tok_alan: {
    userId: 'alan',
    name: 'Alan Turing',
    teamId: 'bletchley',
    teamName: 'Bletchley',
    expiresAt: Date.UTC(2031, 0, 1),
  },
  tok_expired: {
    userId: 'old',
    name: 'Expired User',
    teamId: 'bletchley',
    teamName: 'Bletchley',
    expiresAt: Date.UTC(2024, 0, 1),
  },
}

export async function verifySession(token: string): Promise<Session | null> {
  // Expiry is judged against the time the verification started, not the time
  // the store answered.
  const now = Date.now()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const session = store[token]
  if (!session) return null
  if (session.expiresAt <= now) return null
  return session
}
