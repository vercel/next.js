import Link from 'next/link'
import { Suspense } from 'react'

async function CurrentPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page = '1' } = await searchParams
  return <h1 id="search">Page {page}</h1>
}

export default function Search({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  return (
    <>
      <Suspense fallback={null}>
        <CurrentPage searchParams={searchParams} />
      </Suspense>
      <Link id="to-page-2" href="/search?page=2">
        To page 2
      </Link>
    </>
  )
}
