import type { MetadataRoute } from 'next'
import { unstable_cache } from 'next/cache'

export default unstable_cache(
  async (): Promise<MetadataRoute.Sitemap> => [{ url: 'https://example.com' }],
  ['adapter-config:tagged-sitemap'],
  { tags: ['adapter-config:tagged-sitemap'] }
)
