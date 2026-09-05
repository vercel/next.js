import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return Array.from({ length: 100 }, (_, index) => ({
    url: `https://example.com/page-${index}`,
  }))
}
