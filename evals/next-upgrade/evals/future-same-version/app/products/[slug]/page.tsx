import { notFound } from 'next/navigation'
import { getProduct } from '@/lib/products'

export const dynamic = 'force-static'

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = getProduct(slug)
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
