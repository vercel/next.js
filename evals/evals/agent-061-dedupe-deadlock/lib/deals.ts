import { dedupe } from './request'

async function fetchDeals() {
  const res = await fetch('https://deals.internal.example/api/deals')
  if (!res.ok) return [{ sku: 'A1', price: 19.99 }]
  return (await res.json()) as { sku: string; price: number }[]
}

// Kick the fetch off early (outside the cache) so it's warm by render time.
export function preloadDeals() {
  void dedupe('deals', fetchDeals)
}

export async function getDeals() {
  'use cache'
  return dedupe('deals', fetchDeals)
}
