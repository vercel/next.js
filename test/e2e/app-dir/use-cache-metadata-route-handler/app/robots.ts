import type { MetadataRoute } from 'next'
import { getSentinelValue } from './sentinel'
import { setTimeout } from 'timers/promises'

export default async function robots(): Promise<MetadataRoute.Robots> {
  'use cache'

  // Simulate I/O
  await setTimeout(100)

  return {
    rules: { userAgent: '*', allow: `/${getSentinelValue()}` },
  }
}
