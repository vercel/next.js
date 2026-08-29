import { Suspense } from 'react'
import { getUserPrice } from '@/lib/pricing-core'

async function Price({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const price = await getUserPrice(id)
  return (
    <p data-testid="deal-price" data-deal={price.dealId}>
      Your price: <strong>{price.amount}</strong>
    </p>
  )
}

export default function DealPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <main>
      <h1 data-testid="deal-title">Deal details</h1>
      <Suspense
        fallback={<p data-testid="price-skeleton">Checking your price…</p>}
      >
        <Price params={params} />
      </Suspense>
    </main>
  )
}
