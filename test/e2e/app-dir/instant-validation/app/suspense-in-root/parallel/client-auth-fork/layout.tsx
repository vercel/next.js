import { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { ClientAuthFork } from './client-fork'

// Forks on request state like auth-fork, but the fork decision is made
// by a CLIENT component: this layout serializes BOTH slots into the
// client component's props along with the cookie-derived flag. Which
// branch actually renders is only observable by executing the client
// component during an SSR pass.
export default async function ClientAuthForkLayout({
  children,
  login,
}: {
  children: ReactNode
  login: ReactNode
}) {
  const cookieStore = await cookies()
  const isLoggedIn = cookieStore.has('logged-in')
  return (
    <ClientAuthFork
      isLoggedIn={isLoggedIn}
      loggedInUI={children}
      loggedOutUI={login}
    />
  )
}
