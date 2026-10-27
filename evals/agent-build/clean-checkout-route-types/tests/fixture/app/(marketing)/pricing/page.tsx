const tiers = [
  { name: 'Hobby', price: '$0', deployments: '100 deployments / month' },
  { name: 'Team', price: '$40', deployments: 'Unlimited deployments' },
]

export default function PricingPage() {
  return (
    <main>
      <h1>Pricing</h1>
      <ul>
        {tiers.map((tier) => (
          <li key={tier.name}>
            <strong>{tier.name}</strong> {tier.price} · {tier.deployments}
          </li>
        ))}
      </ul>
    </main>
  )
}
