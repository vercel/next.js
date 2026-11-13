import type { MetadataRoute } from 'next'
import { connection } from 'next/server'

export const maxDuration = 42
export const preferredRegion = ['iad1', 'sfo1']

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection()

  return [
    {
      url: 'https://example.com',
    },
  ]
}
