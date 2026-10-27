const tiers = [
  { name: 'Starter', price: '$0', detail: 'Up to 10 invoices a month' },
  { name: 'Team', price: '$29', detail: 'Unlimited invoices and reminders' },
]

export default function PricingPage() {
  return (
    <main>
      <h1>Pricing</h1>
      <ul>
        {tiers.map((tier) => (
          <li key={tier.name}>
            <strong>{tier.name}</strong> {tier.price} · {tier.detail}
          </li>
        ))}
      </ul>
    </main>
  )
}
