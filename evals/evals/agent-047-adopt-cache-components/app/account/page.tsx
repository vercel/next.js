import { cookies } from 'next/headers'

export default async function AccountPage() {
  const cookieStore = await cookies()
  const displayName = cookieStore.get('display-name')?.value ?? 'Guest'

  return (
    <main>
      <h1>Account</h1>
      <p data-testid="account-greeting">Welcome back, {displayName}.</p>
    </main>
  )
}
