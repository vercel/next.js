import { getRelatedProducts } from '@/lib/data'

export default async function ProductPage() {
  const relatedProducts = await getRelatedProducts()

  return (
    <main>
      <h1>Premium Widget</h1>
      <p>A durable widget for everyday projects.</p>
      <section>
        <h2>Related products</h2>
        <ul>
          {relatedProducts.map((product) => (
            <li key={product}>{product}</li>
          ))}
        </ul>
      </section>
    </main>
  )
}
