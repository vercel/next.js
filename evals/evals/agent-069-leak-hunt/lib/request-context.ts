import type { Session } from './session'

// Ambient request context: loadSession() stores the signed-in user here so
// deeply nested server components can read it without prop drilling.
let currentUser: Session | null = null

export function setCurrentUser(session: Session) {
  currentUser = session
}

export function getCurrentUser(): Session {
  if (!currentUser) {
    throw new Error('getCurrentUser() called before loadSession()')
  }
  return currentUser
}
