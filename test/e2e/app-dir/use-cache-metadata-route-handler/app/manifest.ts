import type { MetadataRoute } from 'next'
import { getSentinelValue } from './sentinel'
import { setTimeout } from 'timers/promises'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  'use cache'

  // Simulate I/O
  await setTimeout(100)

  return { name: getSentinelValue() }
}
