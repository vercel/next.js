import Link from 'next/link'
import { Suspense } from 'react'
import { fetchOrder } from '@/lib/orders'

async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { order, fetchedAt } = await fetchOrder(Number(id))
  if (!order) {
    return <p>Order not found.</p>
  }
  return (
    <>
      <p>Data refreshed {fetchedAt}</p>
      <dl>
        <dt>Customer</dt>
        <dd>{order.customer}</dd>
        <dt>Total</dt>
        <dd>${order.total.toFixed(2)}</dd>
        <dt>Status</dt>
        <dd>{order.status}</dd>
      </dl>
    </>
  )
}

export default function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <main>
      <h1>Order detail</h1>
      <Suspense fallback={<p>Loading order…</p>}>
        <OrderDetail params={params} />
      </Suspense>
      <p>
        <Link href="/orders">Back to orders</Link>
      </p>
    </main>
  )
}
