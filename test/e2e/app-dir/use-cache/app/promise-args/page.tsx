import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

let renderCounter = 0

async function getCachedData(a: Promise<string>, b: Promise<string>) {
  'use cache'

  return (await a) + (await b) + new Date().toISOString()
}

export default async function Page() {
  await connection()
  renderCounter++

  // Flip the promise resolution timing on every render.
  const data = await getCachedData(
    setTimeout(10 * (renderCounter % 2 === 0 ? 1 : 2)).then(() => 'a'),
    setTimeout(10 * (renderCounter % 2 === 0 ? 2 : 1)).then(() => 'b')
  )

  return <p>{data}</p>
}
