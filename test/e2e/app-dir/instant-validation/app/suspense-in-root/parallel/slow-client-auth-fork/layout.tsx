import { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { SlowClientAuthFork } from './slow-client-fork'

// Like client-auth-fork — a client component decides the fork, so both
// slots are serialized and validation must observe which branch renders —
// but the client component burns CPU before rendering. With the
// observation timeout lowered (see the mount-observation-timeout test),
// the observation render for client navigations cannot settle in time and
// validation must report that discovery couldn't complete instead of
// consuming a partial mounted set.
export default async function SlowClientAuthForkLayout({
  children,
  login,
}: {
  children: ReactNode
  login: ReactNode
}) {
  const cookieStore = await cookies()
  const isLoggedIn = cookieStore.has('logged-in')
  return (
    <SlowClientAuthFork
      isLoggedIn={isLoggedIn}
      loggedInUI={children}
      loggedOutUI={login}
    />
  )
}
