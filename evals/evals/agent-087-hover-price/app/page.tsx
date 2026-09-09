import { DealCard } from '@/components/deal-card'
import { deals } from '@/lib/deals'

export default function DealsGrid() {
  return (
    <main>
      <h1 style={{ fontSize: 16, margin: '4px 0' }}>Today&apos;s deals</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', maxWidth: 760 }}>
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>
    </main>
  )
}
