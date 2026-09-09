import { notFound } from 'next/navigation'
import { getProduct, getProducts } from '@/lib/queries'

export async function generateStaticParams() {
  const products = await getProducts()
  return products.map((p) => ({ slug: p.slug }))
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) notFound()
  return (
    <main>
      <h1 data-testid="product-name">{product.name}</h1>
      <p data-testid="product-description">{product.description}</p>
      <p data-testid="product-price">${product.price}</p>
    </main>
  )
}
