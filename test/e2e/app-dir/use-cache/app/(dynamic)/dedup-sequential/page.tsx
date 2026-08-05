import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

let invocations = 0

async function getData(params: { id: number }) {
  'use cache'
  return `${params.id}:${++invocations}`
}

export default async function Page() {
  await connection()

  // The public counterpart of `/private-dedup-sequential`, with the same call
  // shape: a fresh object literal per call so the React.cache memo misses, and
  // a delay that puts the second call outside the in-flight dedupe window. Here
  // the cache handler serves the second call.
  const first = await getData({ id: 1 })

  await setTimeout(100)

  const second = await getData({ id: 1 })

  return (
    <div>
      <p className="first">{first}</p>
      <p className="second">{second}</p>
    </div>
  )
}
