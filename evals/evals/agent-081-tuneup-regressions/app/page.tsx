import { Suspense } from 'react'
import { getPlanPrice } from '@/lib/plan'

async function PlanCard() {
  const price = await getPlanPrice()
  return (
    <section className="plan-card">
      <h2>Team plan</h2>
      <p className="price">{`From $${price.amount}/${price.period}`}</p>
      <p className="blurb">{price.blurb}</p>
      <a href="/billing">Manage billing</a>
    </section>
  )
}

export default function AccountPage() {
  return (
    <main>
      <h1>Your account</h1>
      <p>Overview of your plan, billing, and recent orders.</p>
      <Suspense
        fallback={<p className="plan-loading">Checking current plan price…</p>}
      >
        <PlanCard />
      </Suspense>
      <section className="help">
        <h2>Need a hand?</h2>
        <p>Every plan includes unlimited seats, priority support, and SSO.</p>
      </section>
    </main>
  )
}
