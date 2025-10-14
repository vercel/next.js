import { setTimeout } from 'timers/promises'

export async function getCachedData() {
  'use cache: remote'
  await setTimeout(1000)
  return new Date().toISOString()
}
