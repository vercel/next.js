import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { cacheLife, cacheTag } from 'next/cache'
import { permanentRedirect } from 'next/navigation'

async function getRedirect(slug: string): Promise<string | null> {
  'use cache'
  cacheTag('redirects')
  cacheLife('hours')
  try {
    const file = path.join(process.cwd(), 'data', 'redirects.json')
    const map = JSON.parse(await readFile(file, 'utf8')) as Record<
      string,
      string
    >
    return map[slug] ?? null
  } catch {
    return null
  }
}

export async function generateStaticParams() {
  return [{ slug: 'placeholder' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const destination = await getRedirect(slug)
  if (destination) {
    permanentRedirect(destination)
  }
  return <h1 id="page-content">page {slug}</h1>
}
