import { Suspense } from 'react'
import { loadSession } from '@/lib/session'
import { getAccountSummary } from '@/lib/account'
import { BillingContact } from './billing-contact'

export default function BillingPage() {
  return (
    <main>
      <h1>Billing</h1>
      <Suspense fallback={<p>Loading billing…</p>}>
        <BillingPanel />
      </Suspense>
    </main>
  )
}

async function BillingPanel() {
  const session = await loadSession()
  const summary = await getAccountSummary(session)
  return (
    <section>
      <p data-testid="plan">
        Plan: {summary.plan} ({summary.company})
      </p>
      <BillingContact />
    </section>
  )
}
