import type { MetadataRoute } from 'next'

export const revalidate = 2

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://example.com',
      lastModified: new Date().toISOString(),
    },
  ]
}
