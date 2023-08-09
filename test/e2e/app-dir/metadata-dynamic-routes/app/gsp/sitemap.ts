import { MetadataRoute } from 'next'

export async function generateSitemaps() {
  return [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }]
}

export default function sitemap({ id }): MetadataRoute.Sitemap {
  return [
    {
      url: `https://example.com/dynamic/${id}`,
      lastModified: '2021-01-01',
    },
    {
      url: `https://example.com/dynamic/${id}/about`,
      lastModified: '2021-01-01',
    },
  ]
}
