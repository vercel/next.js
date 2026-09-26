import { unstable_cache } from 'next/cache'
import { connection } from 'next/server'

// Returns a different value on every call, so a cache that is not working is
// visible in the rendered output.
const RANDOM_ENDPOINT = 'https://next-data-api-endpoint.vercel.app/api/random'

// The callback is anonymous, so the item name is the request URL plus a hash.
// This route covers the part of the name that comes from the URL.
const getConfiguration = unstable_cache(
  async () => {
    const res = await fetch(`${RANDOM_ENDPOINT}?unstable-cache`)

    return (await res.text()).trim()
  },
  ['configuration'],
  { tags: ['ascii-tag'], revalidate: 3600 }
)

// The fetch cache reaches the same cache layer, but derives its item name from
// the request URL, which is already percent-encoded. It is a control: it has to
// keep caching for the very request that breaks the entry above.
async function getFetchedValue() {
  const res = await fetch(`${RANDOM_ENDPOINT}?fetch-cache`, {
    next: { revalidate: 3600, tags: ['ascii-fetch-tag'] },
  })

  return (await res.text()).trim()
}

export default async function Page() {
  // The item name only carries the request URL for a dynamic render. A
  // prerender uses the route pattern instead, which is always ASCII.
  //
  // The page never reads `searchParams`. The query string reaches the item name
  // through the request URL either way, so a dynamic route is affected by a
  // query it does not look at, and by one a caller appends to it.
  await connection()

  return (
    <>
      <p id="cached">{await getConfiguration()}</p>
      <p id="fetched">{await getFetchedValue()}</p>
    </>
  )
}
