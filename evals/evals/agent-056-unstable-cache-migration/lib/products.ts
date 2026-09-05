import { unstable_cache } from 'next/cache'

async function fetchProducts() {
  await new Promise((r) => setTimeout(r, 100))
  return [
    { id: 'p1', name: 'Desk', price: 320 },
    { id: 'p2', name: 'Chair', price: 180 },
  ]
}

export const getProducts = unstable_cache(fetchProducts, ['products'], {
  revalidate: 3600,
  tags: ['products'],
})
