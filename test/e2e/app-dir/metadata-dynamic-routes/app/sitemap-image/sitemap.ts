import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://example.com',
      lastModified: '2024-01-01',
      changeFrequency: 'daily',
      priority: 0.5,
    },
    {
      url: 'https://example.com/about',
      lastModified: '2024-01-01',
      images: [
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
      ],
    },
  ]
}
