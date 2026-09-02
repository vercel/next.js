import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

let invocations = 0

async function getData(params: { id: number }) {
  'use cache: private'
  return `${params.id}:${++invocations}`
}

export default async function Page() {
  await connection()

  // Each call passes a fresh object literal, so the React.cache memo that wraps
  // every cache function misses on reference equality and the lookup falls
  // through to the serialized cache key.
  const first = await getData({ id: 1 })

  // The intra-request dedupe map drops an entry once its fill completes, so
  // this delay puts the second call outside the in-flight window. Reuse then
  // depends on the cache store rather than on joining a pending fill.
  await setTimeout(100)

  const second = await getData({ id: 1 })

  return (
    <div>
      <p className="first">{first}</p>
      <p className="second">{second}</p>
    </div>
  )
}
