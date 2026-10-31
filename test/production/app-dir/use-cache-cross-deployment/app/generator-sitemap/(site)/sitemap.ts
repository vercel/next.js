import { getGeneratorValue } from '../../generator-value'

export async function generateSitemaps() {
  return [{ id: await getGeneratorValue('sitemap') }]
}

export default async function sitemap({ id }: { id: Promise<string> }) {
  return [{ url: `https://example.com/${await id}` }]
}
