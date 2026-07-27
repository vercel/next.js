import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://nextjs.org',
      lastModified: '2025-01-01T00:00:00.000Z',
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]
}
