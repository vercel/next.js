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
      videos: [
        {
          title: 'example',
          thumbnail_loc: 'https://example.com/image.jpg',
          description: 'this is the description',
        },
      ],
    },
  ]
}
