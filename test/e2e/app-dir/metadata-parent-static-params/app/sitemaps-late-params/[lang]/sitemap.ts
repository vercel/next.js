import type { MetadataRoute } from 'next'

export const generateSitemaps = () => [{ id: 0 }, { id: 'blog' }]

export const generateStaticParams = () => [{ lang: 'en' }, { lang: 'ja' }]

export default async function sitemap({
  id,
}: {
  id: Promise<string>
}): Promise<MetadataRoute.Sitemap> {
  return [{ url: `https://metadata-parent-static-params.example/${await id}` }]
}
