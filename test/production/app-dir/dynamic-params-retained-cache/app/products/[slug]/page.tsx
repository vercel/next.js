import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const dynamicParams = false
export const revalidate = 3600

export async function generateStaticParams() {
  const slugs: string[] = JSON.parse(
    await readFile(join(process.cwd(), 'slugs.json'), 'utf8')
  )
  return slugs.map((slug) => ({ slug }))
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  console.log('product render', slug)
  return <p id="slug">{slug}</p>
}
