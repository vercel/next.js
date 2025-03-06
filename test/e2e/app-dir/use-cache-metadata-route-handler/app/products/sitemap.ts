import type { MetadataRoute } from 'next'
import { getSentinelValue } from '../sentinel'
import { setTimeout } from 'timers/promises'

export async function generateSitemaps() {
  return [{ id: 0 }, { id: 1 }]
}

export default async function sitemap({
  id,
}: {
  id: number
}): Promise<MetadataRoute.Sitemap> {
  'use cache'

  // Simulate I/O
  await setTimeout(100)

  return [{ url: `https://acme.com/${id}?sentinel=${getSentinelValue()}` }]
}
