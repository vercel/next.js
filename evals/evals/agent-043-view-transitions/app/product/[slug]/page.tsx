import { Suspense } from 'react'
import Link from 'next/link'
import { getProduct, products } from '@/lib/products'
import { notFound } from 'next/navigation'

async function ProductDetails({ slug }: { slug: string }) {
  await new Promise((resolve) => setTimeout(resolve, 100))
  const product = getProduct(slug)
  if (!product) notFound()

  return (
    <div className="product-info">
      <h1>{product.name}</h1>
      <p className="product-price">${product.price}</p>
      <p className="product-description">{product.description}</p>
    </div>
  )
}

function DetailsSkeleton() {
  return (
    <div className="product-info">
      <div className="skeleton-text large" />
      <div className="skeleton-text short" />
      <div className="skeleton-text" />
    </div>
  )
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = products.find((p) => p.slug === slug)
  if (!product) notFound()

  return (
    <div>
      <Link href="/" className="back-link">
        ← Back to products
      </Link>
      <div className="product-detail">
        <div
          className="product-hero"
          style={{ backgroundColor: product.color }}
        />
        <Suspense fallback={<DetailsSkeleton />}>
          <ProductDetails slug={slug} />
        </Suspense>
      </div>
    </div>
  )
}
