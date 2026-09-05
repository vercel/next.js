import { Suspense } from 'react'
import { getCatalog } from '../../lib/catalog'

async function CatalogList(props: {
  searchParams: Promise<{ sort?: string }>
}) {
  const { sort } = await props.searchParams
  const items = await getCatalog(sort ?? 'featured')
  return (
    <ul>
      {items.map((item) => (
        <li key={item.sku}>
          {item.sku}: ${item.price}
        </li>
      ))}
    </ul>
  )
}

export default function ShopPage(props: {
  searchParams: Promise<{ sort?: string }>
}) {
  return (
    <main>
      <h1>Shop</h1>
      <Suspense fallback={<p>Loading catalog…</p>}>
        <CatalogList searchParams={props.searchParams} />
      </Suspense>
    </main>
  )
}
