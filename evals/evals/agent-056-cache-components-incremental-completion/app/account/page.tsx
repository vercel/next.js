import { cookies } from 'next/headers'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

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
