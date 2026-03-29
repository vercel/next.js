import { connection } from 'next/server'

let hasThrown = false

// This component throws during SSR without a Suspense boundary,
// testing error recovery from the initial server render.
export default async function Page() {
  await connection()

  if (!hasThrown) {
    hasThrown = true
    throw new Error('this is a ssr test')
  }

  return <p id="recover">Recovered</p>
}
