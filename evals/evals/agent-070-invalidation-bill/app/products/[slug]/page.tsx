import { Suspense } from 'react'
import Link from 'next/link'
import { getProduct } from '@/lib/queries'

async function ProductDetail({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) {
    return <p>Product not found.</p>
  }
  return (
    <>
      <h1>{product.name}</h1>
      <p>Price: ${product.price}</p>
    </>
  )
}

export default function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <main>
      <Suspense fallback={<p>Loading product…</p>}>
        <ProductDetail params={params} />
      </Suspense>
      <p>
        <Link href="/products">Back to catalog</Link>
      </p>
    </main>
  )
}
