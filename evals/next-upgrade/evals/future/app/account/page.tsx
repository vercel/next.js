import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export default function AccountPage() {
  const cookieStore = cookies()
  const displayName = cookieStore.get('display-name')?.value ?? 'Guest'

  return (
    <main>
      <h1>Account</h1>
      <p>Welcome back, {displayName}.</p>
    </main>
  )
}
