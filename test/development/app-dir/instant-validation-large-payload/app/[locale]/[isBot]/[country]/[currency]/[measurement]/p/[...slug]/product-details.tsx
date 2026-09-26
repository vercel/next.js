'use client'

export function ProductDetails({
  items,
  slug,
}: {
  items: Array<{ id: number; description: string }>
  slug: string[]
}) {
  return (
    <section id="product">
      <h1>{slug.join('/')}</h1>
      {items.map((item) => (
        <span key={item.id}>{item.description}</span>
      ))}
    </section>
  )
}
