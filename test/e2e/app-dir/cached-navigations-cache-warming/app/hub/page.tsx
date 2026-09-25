import Link from 'next/link'
import { Suspense } from 'react'

type Props = {
  searchParams: Promise<{ cacheKey?: string | string[] }>
}

async function ReturnLink({ searchParams }: Props) {
  const { cacheKey } = await searchParams
  if (typeof cacheKey !== 'string' || cacheKey.length === 0) {
    throw new Error('A non-empty cacheKey search parameter is required')
  }
  return (
    <Link href={{ pathname: '/', query: { cacheKey } }} prefetch={false}>
      Return to cached content
    </Link>
  )
}

export default function Page({ searchParams }: Props) {
  return (
    <>
      <h1>Hub</h1>
      <Suspense fallback={null}>
        <ReturnLink searchParams={searchParams} />
      </Suspense>
    </>
  )
}
