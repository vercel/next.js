import { unstable_cache } from 'next/cache'
import { connection } from 'next/server'

const RANDOM_ENDPOINT = 'https://next-data-api-endpoint.vercel.app/api/random'

// `encodeURIComponent` rejects a lone surrogate outright, so an item name
// holding one fails the render rather than the cache read. That makes this a
// stricter case than a name that is merely unrepresentable in a header.
//
// A lone surrogate cannot be written as an identifier, so the name is attached
// through a computed key. The key is a string literal, which a bundler cannot
// rename, so this route carries the constraint in every mode.
const LONE_SURROGATE = '\uD800'

const getConfiguration = unstable_cache(
  {
    [LONE_SURROGATE]: async () => {
      const res = await fetch(`${RANDOM_ENDPOINT}?lone-surrogate`)

      return (await res.text()).trim()
    },
  }[LONE_SURROGATE],
  ['lone-surrogate'],
  { revalidate: 3600 }
)

export default async function Page() {
  await connection()

  return <p id="cached">{await getConfiguration()}</p>
}
