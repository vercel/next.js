import { ReactNode } from 'react'
import { getUser } from '../lib/get-user'
import { UserProvider } from '../user-provider'

export default function LearnLayout({ children }: { children: ReactNode }) {
  const userPromise = getUser()

  return <UserProvider userPromise={userPromise}>{children}</UserProvider>
}
