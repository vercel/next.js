import type { MetadataRoute } from 'next'

export const revalidate = 5

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://example.com/sitemap-revalidation',
      lastModified: new Date().toISOString(),
    },
  ]
}
