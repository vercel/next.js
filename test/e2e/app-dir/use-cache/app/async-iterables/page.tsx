import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

async function getCachedData(iterable: AsyncIterable<string>) {
  'use cache'

  const values: string[] = []

  for await (const value of iterable) {
    console.log('async iterable value:', value)
    values.push(value)
  }
  console.log('async iterable done')

  return [...values].sort().join('') + Math.random()
}

async function cachedDelay() {
  'use cache'
  await setTimeout(100)
}

export default async function Page() {
  await connection()

  const dataA = await getCachedData({
    [Symbol.asyncIterator]: async function* () {
      await cachedDelay() // make sure the iterable is meaningfully async
      yield 'a'
      yield 'b'
    },
  })

  const dataB = await getCachedData({
    [Symbol.asyncIterator]: async function* () {
      await cachedDelay() // make sure the iterable is meaningfully async
      yield 'b'
      yield 'a'
    },
  })

  return (
    <>
      <p id="a">{dataA}</p>
      <p id="b">{dataB}</p>
    </>
  )
}
