'use server'
import { updateTag, cacheTag, cacheLife } from 'next/cache'

export async function getCachedTimestamp() {
  'use cache'
  cacheTag('eager-return-test')
  cacheLife('max')
  return Date.now().toString()
}

export async function updateTagAndReturn() {
  updateTag('eager-return-test')
  const cachedTimestamp = await getCachedTimestamp()
  return {
    success: true,
    timestamp: Date.now().toString(),
    cachedTimestamp,
  }
}
