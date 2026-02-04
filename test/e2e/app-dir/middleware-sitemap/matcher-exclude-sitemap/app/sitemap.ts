import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://vercel.com',
      lastModified: '2023-10-01',
      changeFrequency: 'yearly',
      priority: 1,
    },
  ]
}
