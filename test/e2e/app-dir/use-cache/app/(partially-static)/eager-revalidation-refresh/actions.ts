'use server'
import { updateTag, refresh, cacheTag, cacheLife } from 'next/cache'

async function getCachedTimestamp() {
  'use cache'
  cacheTag('eager-refresh-test')
  cacheLife('max')
  return Date.now().toString()
}

export async function refreshOnly() {
  refresh()
}

export async function updateTagAndRefresh() {
  updateTag('eager-refresh-test')
  refresh()
}

export async function refreshWithReturn() {
  refresh()
  const cachedTimestamp = await getCachedTimestamp()
  return {
    refreshed: true,
    timestamp: Date.now().toString(),
    cachedTimestamp,
  }
}
