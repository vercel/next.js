import { notFound } from 'next/navigation'
import { getProduct } from '@/lib/catalog'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

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
      <h1>{product.name}</h1>
      <p>{product.description}</p>
    </main>
  )
}
