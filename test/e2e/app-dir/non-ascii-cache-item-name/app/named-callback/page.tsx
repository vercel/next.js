import { unstable_cache } from 'next/cache'
import { connection } from 'next/server'

const RANDOM_ENDPOINT = 'https://next-data-api-endpoint.vercel.app/api/random'

// A JavaScript identifier may hold characters above U+00FF, and a named
// callback puts its name into the cache item name. This route is requested
// under a pure ASCII URL, so the name is the only part of the item name that
// can be unrepresentable, and a failure here points at nothing else.
//
// A production build renames the binding, so this route only carries the
// constraint in development.
const pobierzKonfigurację = async () => {
  const res = await fetch(`${RANDOM_ENDPOINT}?named-callback`)

  return (await res.text()).trim()
}

const getConfiguration = unstable_cache(
  pobierzKonfigurację,
  ['named-configuration'],
  { revalidate: 3600 }
)

export default async function Page() {
  await connection()

  return <p id="cached">{await getConfiguration()}</p>
}
