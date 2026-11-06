import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { cacheLife, cacheTag } from 'next/cache'
import { permanentRedirect } from 'next/navigation'

// data/redirects.json maps a slug to a redirect destination. A slug with no
// entry renders a normal page.
async function getRedirect(slug: string): Promise<string | null> {
  'use cache'
  cacheTag('redirects')
  cacheLife('hours')
  const file = path.join(process.cwd(), 'data', 'redirects.json')
  const map: Record<string, string> = JSON.parse(await readFile(file, 'utf8'))
  return map[slug] ?? null
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
  if (destination) permanentRedirect(destination)
  return <p>page {slug}</p>
}
