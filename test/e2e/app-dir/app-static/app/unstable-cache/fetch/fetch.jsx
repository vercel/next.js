import { unstable_cache } from 'next/cache'
import { Suspense } from 'react'

const getData = unstable_cache(
  async (cache) => {
    const res = await fetch(
      'https://next-data-api-endpoint.vercel.app/api/random',
      { cache }
    )

    return res.text()
  },
  undefined,
  {}
)

async function Data({ cache = undefined }) {
  const data = await getData(cache)

  return <div id="data">{data}</div>
}

export default function Page({ cache = undefined }) {
  return (
    <Suspense fallback={<div id="loading">Loading...</div>}>
      <Data cache={cache} />
    </Suspense>
  )
}
