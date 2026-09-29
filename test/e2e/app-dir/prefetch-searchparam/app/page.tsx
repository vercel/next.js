import Link from 'next/link'
import { Suspense } from 'react'

async function SearchParams({ searchParams }: { searchParams: any }) {
  return <p>{JSON.stringify(await searchParams)}</p>
}

export default function Page({ searchParams }: { searchParams: any }) {
  return (
    <>
      <Link href="/">/</Link>
      <Link href="/?q=bar">/?q=bar</Link>
      <Suspense>
        <SearchParams searchParams={searchParams} />
      </Suspense>
    </>
  )
}
