'use client'

import { useUser } from './user-provider'

export function UserCard() {
  const user = useUser()

  return <p id="user">user: {user?.name ?? 'unknown'}</p>
}
