import type { MetadataRoute } from 'next'

export function generateSitemaps() {
  return [{ id: 0 }, { id: 1 }]
}

export default async function sitemap(props: {
  id: Promise<string>
}): Promise<MetadataRoute.Sitemap> {
  const id = await props.id
  return [{ url: `https://example.com/${id}` }]
}
