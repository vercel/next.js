import Link from 'next/link'
import { Suspense } from 'react'
import { getProduct } from '@/lib/products'

async function ProductData({ id }: { id: string }) {
  'use cache'

  const product = await getProduct(id)

  return (
    <main>
      <Link href="/">Back to products</Link>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
    </main>
  )
}

export default function ProductPage({ params }: PageProps<'/products/[id]'>) {
  return (
    <Suspense fallback={<p>Loading product…</p>}>
      {params.then(({ id }) => (
        <ProductData id={id} />
      ))}
    </Suspense>
  )
}
