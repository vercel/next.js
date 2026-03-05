import type { MetadataRoute } from 'next'

export const agent = 'all'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://example.com/',
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: 'https://example.com/docs',
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ]
}
