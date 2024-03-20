import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://example.com',
      lastModified: '2021-01-01',
      changeFrequency: 'daily',
      priority: 0.5,
    },
    {
      url: 'https://example.com/about',
      lastModified: '2021-01-01',
      alternates: {
        languages: {
          es: 'https://example.com/es/about',
          de: 'https://example.com/de/about',
        },
      },
    },
  ]
}
