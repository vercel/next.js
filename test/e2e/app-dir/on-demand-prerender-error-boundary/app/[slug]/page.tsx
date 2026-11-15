import { Suspense } from 'react'
import { headers } from 'next/headers'
import { cacheLife, unstable_noStore } from 'next/cache'
import { SsrError } from '../../ssr-error'
import { getOrigin } from '../../origin'
import { getData } from '../../test-data'

export function generateStaticParams() {
  return [{ slug: 'prerendered' }]
}

async function HeadersContent() {
  const requestHeaders = await headers()
  return <p id="content">{requestHeaders.get('accept-language')}</p>
}

async function IOContent() {
  const response = await fetch(`${getOrigin()}/global/prerendered`, {
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch content: ${response.status}`)
  }
  await response.text()
  return <p id="io-content">Fetched content</p>
}

function NoStoreContent() {
  unstable_noStore()
  return <p id="content">No-store content</p>
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  if (slug.startsWith('recovery-')) {
    const value = await getData(slug)
    if (value === 'error') {
      throw new Error('On-demand application data is unavailable')
    }
    return <p id="content">{value}</p>
  }

  if (slug.startsWith('reported-revalidate-')) {
    const value = await getRevalidatingData(slug)
    if (value === 'error') {
      throw new Error(`Reported revalidation error: ${slug}`)
    }
    return <p id="content">{value}</p>
  }

  if (slug.startsWith('reported-')) {
    throw new Error(`Reported prerender error: ${slug}`)
  }

  if (slug === 'error' || slug.startsWith('error-')) {
    throw new Error('On-demand page render failed')
  }

  switch (slug) {
    case 'io-suspense':
    case 'io-suspense-error':
      return (
        <>
          <Suspense fallback={<p>Loading IO</p>}>
            <IOContent />
          </Suspense>
          {slug === 'io-suspense-error' ? <HeadersContent /> : null}
        </>
      )
    case 'ssr-zero':
      return <SsrError value={0} />
    case 'ssr-false':
      return <SsrError value={false} />
    case 'ssr-empty-string':
      return <SsrError value="" />
    case 'ssr-null':
      return <SsrError value={null} />
    case 'ssr-undefined':
      return <SsrError value={undefined} />
    case 'headers':
      return <HeadersContent />
    case 'headers-suspense':
      return (
        <Suspense fallback={<p>Loading</p>}>
          <HeadersContent />
        </Suspense>
      )
    case 'no-store':
      return <NoStoreContent />
    case 'no-store-suspense':
      return (
        <Suspense fallback={<p>Loading</p>}>
          <NoStoreContent />
        </Suspense>
      )
    default:
      return <h1>{slug}</h1>
  }
}

async function getRevalidatingData(key: string) {
  'use cache'

  cacheLife({ revalidate: 1, expire: 3600 })
  return getData(key)
}
