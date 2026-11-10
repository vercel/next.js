import { connection } from 'next/server'
export async function getProduct(slug: string) {
  'use cache'
  return slug === 'hats'
    ? { name: 'Baseball Cap', price: '24.00' }
    : { name: 'Running Shoes', price: '89.00' }
}
export async function getStock(slug: string) {
  await connection()
  return slug === 'hats' ? 5 : 12
}
