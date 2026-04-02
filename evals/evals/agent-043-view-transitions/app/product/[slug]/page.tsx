import { Suspense } from 'react'
import Link from 'next/link'
import { getProduct } from '@/lib/products'
import { ProductDetailSkeleton } from '@/app/ProductSkeleton'
import { notFound } from 'next/navigation'

async function ProductInfo({ slug }: { slug: string }) {
  await new Promise((resolve) => setTimeout(resolve, 100))
  const product = getProduct(slug)
  if (!product) notFound()

  return (
    <div className="product-detail">
      <div
        className="product-hero"
        style={{ backgroundColor: product.color }}
      />
      <div className="product-info">
        <h1>{product.name}</h1>
        <p className="product-price">${product.price}</p>
        <p className="product-description">{product.description}</p>
      </div>
    </div>
  )
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <div>
      <Link href="/" className="back-link">
        ← Back to products
      </Link>
      <Suspense fallback={<ProductDetailSkeleton />}>
        <ProductInfo slug={slug} />
      </Suspense>
    </div>
  )
}
