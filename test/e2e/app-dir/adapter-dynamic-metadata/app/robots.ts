import type { MetadataRoute } from 'next'
import { connection } from 'next/server'

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection()

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: 'https://example.com/sitemap.xml',
  }
}
