import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { notFound } from 'next/navigation'

export const dynamicParams = false
export const revalidate = 3600

export function generateStaticParams() {
  return [
    { slug: 'known' },
    { slug: 'concurrent' },
    { slug: 'mutable' },
    { slug: 'initially-missing' },
  ]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  console.log('closed page render', slug)
  // A small file-backed data source lets content change without rebuilding.
  const content = JSON.parse(
    await readFile(join(process.cwd(), 'content.json'), 'utf8')
  )
  if (content[slug] === null) notFound()
  return <p id="generation">{randomUUID()}</p>
}
