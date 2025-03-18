import { connection } from 'next/server'

async function getCachedData(iterable: AsyncIterable<string>) {
  'use cache'

  const values: string[] = []

  for await (const value of iterable) {
    values.push(value)
  }

  return [...values].sort().join('') + Math.random()
}

export default async function Page() {
  await connection()

  const dataA = await getCachedData({
    [Symbol.asyncIterator]: async function* () {
      yield 'a'
      yield 'b'
    },
  })

  const dataB = await getCachedData({
    [Symbol.asyncIterator]: async function* () {
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
