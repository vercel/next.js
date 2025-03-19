import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

async function getCachedData(iterator: AsyncIterator<string>) {
  'use cache'

  const values: string[] = []

  while (true) {
    const result = await iterator.next()

    if (result.done) {
      console.log('async iterator done')
      break
    }

    values.push(result.value)
    console.log('async iterator value:', result.value)
  }

  return [...values].sort().join('') + Math.random()
}

async function cachedDelay() {
  'use cache'
  await setTimeout(100)
}

export default async function Page() {
  await connection()

  const dataA = await getCachedData(
    (async function* () {
      await cachedDelay() // make sure the iterable is meaningfully async
      yield 'a'
      yield 'b'
    })()
  )

  const dataB = await getCachedData(
    (async function* () {
      await cachedDelay() // make sure the iterable is meaningfully async
      yield 'b'
      yield 'a'
    })()
  )

  return (
    <>
      <p id="a">{dataA}</p>
      <p id="b">{dataB}</p>
    </>
  )
}
