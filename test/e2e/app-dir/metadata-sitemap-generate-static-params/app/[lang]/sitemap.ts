import type { MetadataRoute } from 'next'

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'zh' }]
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://example.com/',
      lastModified: '2021-01-01',
    },
  ]
}
