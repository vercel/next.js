import { setTimeout } from 'timers/promises'

export async function getCachedData() {
  'use cache'
  await setTimeout(1000)
  return new Date().toISOString()
}
