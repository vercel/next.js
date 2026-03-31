import { MetadataRoute } from 'next'

export async function generateSitemaps() {
  return [
    { id: 'child0' },
    { id: 'child1' },
    { id: 'child2' },
    { id: 'child3' },
  ]
}

export default async function sitemap({ id }): Promise<MetadataRoute.Sitemap> {
  const sitemapId = await id
  return [
    {
      url: `https://example.com/dynamic/${sitemapId}`,
      lastModified: '2021-01-01',
    },
    {
      url: `https://example.com/dynamic/${sitemapId}/about`,
      lastModified: '2021-01-01',
    },
  ]
}
