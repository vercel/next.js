import type { AgentRoute, MetadataRoute } from 'next'

export async function semanticSitemap(): Promise<MetadataRoute.SemanticSitemap> {
  const sections: AgentRoute.Section[] = [
    {
      title: 'Posts',
      content: 'Latest blog posts and tutorials.',
    },
  ]

  return [
    {
      url: 'https://example.com/blog',
      title: 'Blog Index',
      summary: 'Entry point for all blog content.',
      sections,
    },
  ]
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://example.com/blog',
    },
  ]
}
