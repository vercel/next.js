import Link from 'next/link'
import { notFound } from 'next/navigation'
import { products } from '../../../lib/products'

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = products.find((item) => item.slug === slug)
  if (!product) notFound()
  return (
    <>
      <Link href="/products">Back to products</Link>
      <h1>{product.name}</h1>
      <p>
        {product.category} / ${product.price}
      </p>
    </>
  )
}
