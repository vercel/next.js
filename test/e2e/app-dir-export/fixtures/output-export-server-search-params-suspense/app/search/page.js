import { Suspense } from 'react'

async function SearchContent({ searchParams }) {
  const query = await searchParams

  return <h1>{query.q}</h1>
}

export default function SearchPage({ searchParams }) {
  return (
    <Suspense fallback={<p>loading</p>}>
      <SearchContent searchParams={searchParams} />
    </Suspense>
  )
}
