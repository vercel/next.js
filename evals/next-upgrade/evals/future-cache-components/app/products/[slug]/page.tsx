import { notFound } from 'next/navigation'
import { getProduct } from '@/lib/products'

export const dynamic = 'force-static'

export default function ProductPage({ params }: { params: { slug: string } }) {
  const product = getProduct(params.slug)
  if (!product) notFound()

  return (
    <main>
      <h1>Product</h1>
      <article>
        <h2>{product.name}</h2>
        <p>{product.description}</p>
      </article>
    </main>
  )
}
