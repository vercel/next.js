import { connection } from 'next/server'
import { Suspense } from 'react'

export default function DynamicPPRPage({
  searchParams,
}: {
  searchParams: Promise<{ delay?: string }>
}) {
  return (
    <div>
      <h1 id="search-params-page">Search Params Page</h1>
      <Suspense fallback={<div id="suspense-fallback">Loading...</div>}>
        <DelayedLoad searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

const DelayedLoad = async ({
  searchParams,
}: {
  searchParams: Promise<{ delay?: string }>
}) => {
  const params = await searchParams
  const delay = Number(params.delay) || 0
  await connection()

  return (
    <div>
      <p id="delay-value">Delay: {delay}</p>
    </div>
  )
}
