import type { MetadataRoute } from 'next'

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'zh' }]
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://example.com',
      lastModified: '2021-01-01',
    },
  ]
}
