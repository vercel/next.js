import type { MetadataRoute } from 'next'

export function generateStaticParams() {
  return []
}

export function generateSitemaps() {
  console.log('metadata-parent-static-params: generated runtime sitemap IDs')
  return [{ id: 'runtime' }]
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>
}): Promise<MetadataRoute.Sitemap> {
  return [{ url: `https://metadata-parent-static-params.example/${await id}` }]
}
