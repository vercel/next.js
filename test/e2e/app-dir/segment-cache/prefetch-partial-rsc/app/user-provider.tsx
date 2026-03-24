'use client'

import { createContext, ReactNode, use } from 'react'

type User = { name: string } | undefined

const UserContext = createContext<Promise<User> | null>(null)
UserContext.displayName = 'UserContext'

export function UserProvider({
  children,
  userPromise,
}: {
  children: ReactNode
  userPromise: Promise<User>
}) {
  return (
    <UserContext.Provider value={userPromise}>{children}</UserContext.Provider>
  )
}

export function useUser(): User {
  const userPromise = use(UserContext)
  if (!userPromise) {
    throw new Error('useUser must be used within a UserProvider')
  }

  return use(userPromise)
}
