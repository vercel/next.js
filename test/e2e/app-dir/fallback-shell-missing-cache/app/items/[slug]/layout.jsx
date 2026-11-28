export function generateStaticParams() {
  return [{ slug: 'a' }]
}

export default async function ItemLayout({ children, params }) {
  const { slug } = await params
  return (
    <section>
      <h1 id="item-title">Item {slug}</h1>
      {children}
    </section>
  )
}
