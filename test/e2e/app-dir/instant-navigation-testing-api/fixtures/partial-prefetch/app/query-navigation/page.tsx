import Link from 'next/link'
import { Suspense } from 'react'
import { navigation } from 'next/cache'

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  return (
    <>
      <h1>Shop</h1>
      <input aria-label="Shopping note" />
      <Suspense fallback={<p>Loading catalogue</p>}>
        <Catalogue searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Catalogue({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category = 'all' } = await searchParams
  return (
    <Suspense key={category} fallback={<p>Loading category</p>}>
      <Link href="/query-navigation?category=all" prefetch={true}>
        All
      </Link>
      <Link href="/query-navigation?category=home" prefetch={true}>
        Home
      </Link>
      <p id="category">{category}</p>
      <Suspense fallback={<p id="stock-pending">Checking stock</p>}>
        <Stock category={category} />
      </Suspense>
    </Suspense>
  )
}

async function Stock({ category }: { category: string }) {
  await navigation()
  return <p id="stock">{category}: 10 in stock</p>
}
