import type { MetadataRoute } from 'next'

/**
 * Generate multiple sitemaps using generateSitemaps function.
 * This should create:
 * - /sitemap.xml - Sitemap index (expected but currently returns 404)
 * - /sitemap/pages.xml - Static pages sitemap
 * - /sitemap/blog.xml - Blog sitemap
 */
export async function generateSitemaps() {
  return [{ id: 'pages' }, { id: 'blog' }]
}

export default async function sitemap(props: {
  id: Promise<string>
}): Promise<MetadataRoute.Sitemap> {
  const id = await props.id

  switch (id) {
    case 'pages':
      return [
        {
          url: 'https://example.com',
          lastModified: '2024-01-01',
          changeFrequency: 'weekly',
          priority: 1.0,
        },
        {
          url: 'https://example.com/about',
          lastModified: '2024-01-01',
          changeFrequency: 'monthly',
          priority: 0.8,
        },
      ]
    case 'blog':
      return [
        {
          url: 'https://example.com/blog/post-1',
          lastModified: '2024-01-01',
          changeFrequency: 'weekly',
          priority: 0.7,
        },
        {
          url: 'https://example.com/blog/post-2',
          lastModified: '2024-01-01',
          changeFrequency: 'weekly',
          priority: 0.7,
        },
      ]
    default:
      return []
  }
}
