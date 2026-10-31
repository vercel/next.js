import { readFile } from 'node:fs/promises'
import { cacheLife, cacheTag } from 'next/cache'
import { permanentRedirect } from 'next/navigation'

async function getRedirects(): Promise<Record<string, string>> {
  'use cache'
  cacheTag('redirects')
  cacheLife('hours')
  return JSON.parse(await readFile('redirects.json', 'utf8'))
}

export function generateStaticParams() {
  return [{ slug: 'seed' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const redirects = await getRedirects()
  if (redirects[slug]) permanentRedirect(redirects[slug])
  return <p>{slug}</p>
}
