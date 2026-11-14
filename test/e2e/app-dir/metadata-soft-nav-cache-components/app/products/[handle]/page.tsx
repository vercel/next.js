import { cacheLife } from 'next/cache'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ClientContent } from './client-content'

const products: Record<string, { title: string }> = {
  alpha: { title: 'Alpha Product' },
  beta: { title: 'Beta Product' },
  gamma: { title: 'Gamma Product' },
  delta: { title: 'Delta Product' },
  epsilon: { title: 'Epsilon Product' },
  zeta: { title: 'Zeta Product' },
  eta: { title: 'Eta Product' },
}

async function getProduct({
  handle,
  locale,
}: {
  handle: string
  locale: string
}) {
  'use cache'
  cacheLife('max')
  return { ...products[handle], locale }
}

export function generateStaticParams() {
  return [{ handle: 'alpha' }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const product = await getProduct({ handle, locale: 'en' })
  return { title: product.title }
}

export const instant = false

export default async function ProductPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const product = await getProduct({ handle, locale: 'en' })

  return (
    <main>
      <Suspense fallback={<p id="product-fallback">Loading product</p>}>
        <ClientContent title={product.title} />
      </Suspense>
      <Link href="/">Home</Link>
    </main>
  )
}
