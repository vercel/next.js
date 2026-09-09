import { cacheLife } from 'next/cache'

export async function getRelatedProducts() {
  'use cache'
  cacheLife('hours')
  return ['Compact Widget', 'Widget Carry Case']
}
