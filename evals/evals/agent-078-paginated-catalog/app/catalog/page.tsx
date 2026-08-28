import Link from 'next/link'
import { Suspense } from 'react'
import { getCatalogPage } from '@/lib/queries'

export default function CatalogRoute({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  return (
    <main>
      <h2>Catalog</h2>
      <Suspense fallback={<p>Loading products…</p>}>
        <CatalogPage searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const rawPage = (await searchParams).page
  const page = Math.max(1, Math.trunc(Number(rawPage)) || 1)
  const products = await getCatalogPage(page)
  return (
    <>
      <ul>
        {products.map((product) => (
          <li key={product.sku}>
            <span>{product.sku}</span> {product.name} — ${product.price}
          </li>
        ))}
      </ul>
      <nav aria-label="Pagination">
        <Link href="/catalog?page=1">Page 1</Link>{' '}
        <Link href="/catalog?page=2">Page 2</Link>{' '}
        <Link href="/catalog?page=3">Page 3</Link>
      </nav>
    </>
  )
}
