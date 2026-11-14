import type { MetadataRoute } from 'next'

export const unstable_paramMatching = { lang: 'not-found' } as const

export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://route-handler-param-matching.example/single-sitemap' },
  ]
}
