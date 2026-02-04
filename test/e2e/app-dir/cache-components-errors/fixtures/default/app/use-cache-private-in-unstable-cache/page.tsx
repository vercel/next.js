import { unstable_cache } from 'next/cache'

export default function Page() {
  return (
    <>
      <p>
        This page nests `'use cache: private'` in `unstable_cache`, which
        triggers an error.
      </p>
      <ComponentWithCachedData />
    </>
  )
}

async function ComponentWithCachedData() {
  const data = await getCachedData()

  return <p>{data}</p>
}

const getCachedData = unstable_cache(async () => {
  'use cache: private'

  return fetch('https://next-data-api-endpoint.vercel.app/api/random').then(
    (res) => res.json()
  )
})
