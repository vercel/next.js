import Link from 'next/link'
import { Suspense } from 'react'
import { fetchOrders } from '@/lib/orders'

async function OrdersTable() {
  const { orders, fetchedAt } = await fetchOrders()
  return (
    <>
      <p>Data refreshed {fetchedAt}</p>
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <Link href={`/orders/${order.id}`}>#{order.id}</Link>
              </td>
              <td>{order.customer}</td>
              <td>${order.total.toFixed(2)}</td>
              <td>{order.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export default function OrdersPage() {
  return (
    <main>
      <h1>Orders</h1>
      <Suspense fallback={<p>Loading orders…</p>}>
        <OrdersTable />
      </Suspense>
    </main>
  )
}
