import { readFile } from 'node:fs/promises'
import { generateImage, size, contentType } from '../../og/generate-image'

export const alt = 'Blog post'
export { size, contentType }

async function getTitle(slug: string) {
  'use cache'
  const file = await readFile('./posts/' + slug + '.txt', 'utf8')
  return file.trim()
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const title = await getTitle(slug)
  return generateImage(title)
}

export async function generateStaticParams() {
  return [{ slug: 'first-post' }, { slug: 'second-post' }]
}
