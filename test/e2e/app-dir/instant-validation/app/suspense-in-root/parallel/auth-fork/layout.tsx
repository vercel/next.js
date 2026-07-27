import { ReactNode } from 'react'
import { cookies } from 'next/headers'

// Forks on request state: when the `logged-in` cookie is present only
// `children` renders; when it is absent only the `@login` slot renders.
// The unsuspended cookies() read makes this layout itself a blocking
// hole — whether that hole is a violation depends on the config of the
// slot that actually rendered in this request.
export default async function AuthForkLayout({
  children,
  login,
}: {
  children: ReactNode
  login: ReactNode
}) {
  const cookieStore = await cookies()
  if (cookieStore.has('logged-in')) {
    return <section data-branch="children">{children}</section>
  }
  return <section data-branch="login">{login}</section>
}
