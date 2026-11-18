import type { MetadataRoute } from 'next'

// `generateSitemaps` makes this a `/sitemap/[__metadata_id__]` route in the
// routes manifest, while the analyzer writes its data under `/sitemap.xml`.
export async function generateSitemaps() {
  return [{ id: 0 }, { id: 1 }]
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>
}): Promise<MetadataRoute.Sitemap> {
  return [{ url: `https://example.com/${await id}` }]
}
