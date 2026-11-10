// Mock authentication library
// In a real app, this would verify session tokens, JWTs, etc.

export interface Session {
  userId: string
  role: 'user' | 'admin'
  name: string
}

// Simulates getting the current user's session
// Returns null if not authenticated
export async function getSession(): Promise<Session | null> {
  // For testing purposes, return a non-admin user
  return {
    userId: '123',
    role: 'user', // Not an admin
    name: 'John Doe',
  }
}

// Helper to check if user has admin role
export async function verifyAdmin(): Promise<{
  isAdmin: boolean
  session: Session | null
}> {
  const session = await getSession()
  return {
    isAdmin: session?.role === 'admin',
    session,
  }
}
