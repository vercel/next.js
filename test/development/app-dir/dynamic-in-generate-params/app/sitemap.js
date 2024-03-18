export default function sitemap() {
  return [
    {
      url: 'https://acme.com',
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 1,
    },
    {
      url: 'https://acme.com/about',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]
}

export const dynamic = 'force-dynamic'

export async function generateSitemaps() {
  await fetch('https://example.com')
  return [{ id: 0 }, { id: 1 }]
}
