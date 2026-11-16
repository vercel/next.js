import { connection } from 'next/server'

async function load<T>(
  section: string,
  fallback: T,
  delay: number
): Promise<T> {
  await connection()
  const origin = process.env.DASHBOARD_API_URL
  if (origin) {
    const response = await fetch(`${origin}/${section}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Failed to load ${section}`)
    return response.json()
  }
  await new Promise((resolve) => setTimeout(resolve, delay))
  return fallback
}

export function getCardStats() {
  return load('cards', { totalRevenue: 12000, totalInvoices: 24 }, 100)
}

export function getRevenue() {
  return load('revenue', [{ month: 'January', amount: 12000 }], 300)
}

export function getInvoices() {
  return load('invoices', [{ id: '1', name: 'Acme', amount: 500 }], 600)
}
