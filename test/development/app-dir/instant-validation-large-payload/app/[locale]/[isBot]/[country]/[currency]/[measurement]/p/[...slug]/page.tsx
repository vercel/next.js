import type { Metadata } from 'next'

import { ProductDetails } from './product-details'

type RootParams = {
  locale: string
  isBot: string
  country: string
  currency: string
  measurement: string
}

type ProductParams = RootParams & {
  slug: string[]
}

const items = Array.from({ length: 100_000 }, (_, id) => ({
  id,
  description: `${id}:${'x'.repeat(128)}`,
}))

// These partial params intentionally omit the catch-all slug. Each entry
// prerenders the route's loading fallback for one concrete root-param set.
export function generateStaticParams(): RootParams[] {
  return Array.from({ length: 48 }, (_, index) => ({
    locale: index === 0 ? 'en' : `locale-${index}`,
    isBot: 'false',
    country: 'US',
    currency: 'USD',
    measurement: 'metric',
  }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<ProductParams>
}): Promise<Metadata> {
  const { slug } = await params
  return { title: slug.join('/') }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<ProductParams>
}) {
  const { slug } = await params

  return <ProductDetails items={items} slug={slug} />
}
