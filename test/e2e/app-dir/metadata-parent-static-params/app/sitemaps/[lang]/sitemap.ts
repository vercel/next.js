import type { MetadataRoute } from 'next'

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'ja' }]
}

export function generateSitemaps() {
  return [{ id: 0 }, { id: 'blog' }]
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>
}): Promise<MetadataRoute.Sitemap> {
  return [{ url: `https://metadata-parent-static-params.example/${await id}` }]
}
