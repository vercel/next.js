import type { MetadataRoute } from 'next'

export const runtime = 'edge'

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: 'https://example.com' }]
}
