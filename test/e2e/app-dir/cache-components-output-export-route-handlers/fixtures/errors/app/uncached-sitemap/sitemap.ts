export async function generateSitemaps() {
  const response = await fetch(`${process.env.CC_EXPORT_DATA_URL}/sitemap`, {
    cache: 'no-store',
  })
  return response.json()
}

export default function sitemap() {
  return [{ url: 'https://cc-export-metadata.example/uncached' }]
}
