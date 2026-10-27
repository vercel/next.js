import Link from 'next/link'
import { Suspense } from 'react'
import { getCurrentCustomer } from '@/lib/customers'

export default function AccountPage() {
  return (
    <main>
      <h1>Account</h1>
      <Suspense
        fallback={<p data-testid="account-loading">Loading your account…</p>}
      >
        <AccountDetails />
      </Suspense>
    </main>
  )
}

async function AccountDetails() {
  const customer = await getCurrentCustomer()

  if (!customer) {
    return (
      <p data-testid="signed-out">
        You are not signed in.{' '}
        <Link href="/account/sign-in?as=ada">Sign in</Link>
      </p>
    )
  }

  return (
    <dl data-testid="customer">
      <dt>Customer</dt>
      <dd>{customer.name}</dd>
      <dt>Plan</dt>
      <dd>{customer.plan}</dd>
      <dt>Monitors</dt>
      <dd>{customer.monitors}</dd>
    </dl>
  )
}
