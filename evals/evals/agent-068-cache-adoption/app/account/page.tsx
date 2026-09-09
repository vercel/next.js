import { getSession } from '@/lib/session'
import { getUser } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const session = await getSession()
  if (!session) {
    return (
      <main>
        <h1 data-testid="account-heading">Your account</h1>
        <p data-testid="signed-out">You are not signed in.</p>
      </main>
    )
  }
  const user = await getUser(session.userId)
  return (
    <main>
      <h1 data-testid="account-heading">Your account</h1>
      <p data-testid="account-name">Signed in as {user?.name}</p>
      <p data-testid="billing-email">Billing email: {user?.billingEmail}</p>
    </main>
  )
}
