import type { MetadataRoute } from 'next'
import { getSentinelValue } from '../sentinel'

export async function generateSitemaps() {
  return [{ id: 0 }, { id: 1 }]
}

export default async function sitemap({
  id,
}: {
  id: Promise<number>
}): Promise<MetadataRoute.Sitemap> {
  'use cache'

  const resolvedId = await id

  return [
    { url: `https://acme.com/${resolvedId}?sentinel=${getSentinelValue()}` },
  ]
}
