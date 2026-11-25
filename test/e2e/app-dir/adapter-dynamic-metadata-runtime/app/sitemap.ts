import type { MetadataRoute } from 'next'
import { connection } from 'next/server'

export const runtime = 'nodejs'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection()

  return [
    {
      url: 'https://example.com',
    },
  ]
}
