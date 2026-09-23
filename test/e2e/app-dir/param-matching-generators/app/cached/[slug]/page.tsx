import { cacheLife, cacheTag } from 'next/cache'

async function readMatchingConfig() {
  'use cache'
  cacheLife('hours')
  cacheTag('matching-config')
  return { slug: 'blocking' } as const
}

export async function experimental_generateParamMatching() {
  return readMatchingConfig()
}

export function generateStaticParams() {
  return [{ slug: 'first' }]
}

export default async function Page({ params }: PageProps<'/cached/[slug]'>) {
  return <p id="cached-matcher">Cached matcher: {(await params).slug}</p>
}
