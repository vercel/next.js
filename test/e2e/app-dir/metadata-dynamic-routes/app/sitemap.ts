import 'server-only'
import { MetadataRoute } from 'next'

/* without generateSitemaps */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://example.com',
      lastModified: '2021-01-01',
      changeFrequency: 'weekly',
      priority: 0.5,
    },
    {
      url: 'https://example.com/about',
      lastModified: '2021-01-01',
    },
  ]
}
