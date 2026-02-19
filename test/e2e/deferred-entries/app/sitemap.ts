import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://example.com/deferred-entries',
      lastModified: new Date('2024-01-01T00:00:00.000Z'),
    },
  ]
}
