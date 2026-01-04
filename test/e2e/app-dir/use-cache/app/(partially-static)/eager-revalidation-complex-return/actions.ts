'use server'
import { updateTag, cacheTag, cacheLife } from 'next/cache'

async function getCachedTimestamp() {
  'use cache'
  cacheTag('eager-complex-test')
  cacheLife('max')
  return Date.now().toString()
}

export async function complexAction() {
  updateTag('eager-complex-test')
  const cachedTimestamp = await getCachedTimestamp()
  return {
    nested: {
      value: 'nested-value',
      deep: {
        array: [1, 2, 3, 4, 5],
      },
    },
    array: ['a', 'b', 'c'],
    timestamp: Date.now(),
    cachedTimestamp,
  }
}
