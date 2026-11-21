import type { MetadataRoute } from 'next'
import { unstable_cache } from 'next/cache'

// Only on-demand invalidation should refresh this sitemap.
export const revalidate = false

const getLastModified = unstable_cache(
  async () => new Date().toISOString(),
  ['sitemap-revalidation:tagged'],
  { tags: ['sitemap-revalidation:tagged'], revalidate: false }
)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    {
      url: 'https://example.com/sitemap-revalidation/tagged',
      lastModified: await getLastModified(),
    },
  ]
}
