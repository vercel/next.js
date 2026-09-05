export const revalidate = 3600

async function fetchPricing() {
  await new Promise((r) => setTimeout(r, 100))
  return [
    { plan: 'Free', price: 0 },
    { plan: 'Pro', price: 20 },
  ]
}

export default async function PricingPage() {
  const plans = await fetchPricing()
  return (
    <main>
      <h1>Pricing</h1>
      <ul>
        {plans.map((p) => (
          <li key={p.plan}>
            {p.plan}: ${p.price}/mo
          </li>
        ))}
      </ul>
    </main>
  )
}
