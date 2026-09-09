import { Suspense } from 'react'
import { getPrice } from '../lib/pricing'

async function PriceCard() {
  const price = await getPrice()
  return (
    <section className="price-card">
      <h2>Team plan</h2>
      <p className="price">{`From $${price.amount}/${price.period}`}</p>
      <p className="blurb">{price.blurb}</p>
      <a href="/signup">Start free trial</a>
    </section>
  )
}

export default function PricingPage() {
  return (
    <>
      <header>
        <nav>
          <a href="/">Acme Analytics</a>
          <a href="/features">Features</a>
          <a href="/pricing">Pricing</a>
          <a href="/docs">Docs</a>
        </nav>
      </header>
      <main>
        <h1>Simple, transparent pricing</h1>
        <p>One plan with everything included. Cancel anytime.</p>
        <Suspense fallback={<p className="price-loading">Checking current price…</p>}>
          <PriceCard />
        </Suspense>
        <section className="faq">
          <h2>Frequently asked questions</h2>
          <p>Every plan includes unlimited dashboards, alerts, and SSO.</p>
        </section>
      </main>
      <footer>© 2026 Acme Analytics, Inc.</footer>
    </>
  )
}
