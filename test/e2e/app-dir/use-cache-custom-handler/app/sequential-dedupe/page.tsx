import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

async function getData(params: { id: number }) {
  'use cache'

  return `${params.id}:${new Date().toISOString()}`
}

export default async function Page() {
  await connection()

  // A fresh object literal per call, so the React.cache memo misses on
  // reference equality, and a delay between them so the second call is outside
  // the in-flight dedupe window. Reuse therefore has to come from a stored
  // entry.
  const first = await getData({ id: 1 })
  await setTimeout(100)
  const second = await getData({ id: 1 })

  return (
    <div>
      <p id="first">{first}</p>
      <p id="second">{second}</p>
    </div>
  )
}
