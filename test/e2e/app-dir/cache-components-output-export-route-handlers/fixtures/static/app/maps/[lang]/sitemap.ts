import type { MetadataRoute } from 'next'

export const unstable_paramMatching = { lang: 'not-found' } as const

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'ja' }]
}

export async function generateSitemaps() {
  'use cache'
  return [{ id: 0 }, { id: 'blog' }]
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>
}): Promise<MetadataRoute.Sitemap> {
  return [{ url: `https://cc-export-metadata.example/${await id}` }]
}
