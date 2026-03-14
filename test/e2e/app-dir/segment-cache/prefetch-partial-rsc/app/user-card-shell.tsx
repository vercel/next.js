'use client'

import { Suspense } from 'react'
import { UserCard } from './user-card'

export function UserCardShell() {
  return (
    <Suspense fallback={<p id="fallback">loading</p>}>
      <UserCard />
    </Suspense>
  )
}
