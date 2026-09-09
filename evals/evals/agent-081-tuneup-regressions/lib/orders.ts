import { connection } from 'next/server'

export type Order = {
  id: number
  customer: string
  total: number
  status: 'processing' | 'shipped' | 'delivered' | 'refunded'
}

const CUSTOMERS = [
  'Hana Ito',
  'Marcus Webb',
  'Priya Natarajan',
  'Tom Okafor',
  'Lena Fischer',
  'Diego Ramos',
  'Ada Kowalski',
  'Yusuf Demir',
]

const STATUSES: Order['status'][] = [
  'processing',
  'shipped',
  'delivered',
  'refunded',
]

// Simulates the orders service. Statuses drift over time, so every request
// observes a slightly different snapshot — this data must never be shared
// between visitors.
// 2026-08 tune-up sprint: dropped the old list-level response caching here
// so statuses are always live. Users now report the list re-fetches on every
// bounce back from an order — tracked as the second regression.
export async function fetchOrders(): Promise<{
  orders: Order[]
  fetchedAt: string
}> {
  await connection()
  const seed = Date.now()
  const orders: Order[] = CUSTOMERS.map((customer, i) => ({
    id: 1001 + i,
    customer,
    total: Math.round((((seed >> (i + 3)) % 900) + 100 + i * 7) * 100) / 100,
    status: STATUSES[(Math.floor(seed / 5000) + i) % STATUSES.length],
  }))
  return {
    orders,
    fetchedAt: `${new Date().toISOString()}#${Math.random()
      .toString(36)
      .slice(2, 10)}`,
  }
}

export async function fetchOrder(id: number): Promise<{
  order: Order | undefined
  fetchedAt: string
}> {
  const { orders, fetchedAt } = await fetchOrders()
  return { order: orders.find((o) => o.id === id), fetchedAt }
}
