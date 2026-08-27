import { notFound } from 'next/navigation'
import { getProduct, getRelatedProducts } from '@/lib/products'

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ currency?: string }>
}) {
  const { slug } = await params
  const { currency = 'USD' } = await searchParams
  const product = await getProduct(slug, currency)
  if (!product) notFound()
  const related = await getRelatedProducts(slug)

  return (
    <main>
      <p>Signal Shop collection</p>
      <h1>{product.name}</h1>
      <p>{product.price}</p>
      <section>
        <h2>Related products</h2>
        {related.map((item) => (
          <p key={item.slug}>{item.name}</p>
        ))}
      </section>
    </main>
  )
}
