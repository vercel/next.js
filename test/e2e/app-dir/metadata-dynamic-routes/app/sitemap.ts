import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://example.com',
      lastModified: '2021-01-01',
    },
    {
      url: 'https://example.com/about',
      lastModified: '2021-01-01',
    },
  ]
}
