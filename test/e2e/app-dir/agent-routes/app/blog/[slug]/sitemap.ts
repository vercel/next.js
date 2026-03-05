import type { MetadataRoute } from 'next'

export const agent = 'all'

export async function semanticSitemap(): Promise<MetadataRoute.SemanticSitemap> {
  return [
    {
      url: 'https://example.com/blog/dynamic',
      title: 'Dynamic Blog Index',
      summary: 'Semantic sitemap for dynamic blog segments.',
    },
  ]
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://example.com/blog/dynamic',
    },
  ]
}
