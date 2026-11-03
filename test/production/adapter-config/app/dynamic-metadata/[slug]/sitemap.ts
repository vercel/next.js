import type { MetadataRoute } from 'next'

export const revalidate = 5

export function generateStaticParams() {
  return [{ slug: 'first' }]
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: 'https://example.com' }]
}
