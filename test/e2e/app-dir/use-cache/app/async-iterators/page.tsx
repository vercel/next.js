import { connection } from 'next/server'

async function getCachedData(iterator: AsyncIterator<string>) {
  'use cache'

  const values: string[] = []

  while (true) {
    const result = await iterator.next()

    if (result.done) {
      break
    }

    values.push(result.value)
  }

  while (true) {
    const result = await iterator.next()

    if (result.done) {
      break
    }

    values.push(result.value)
  }

  return [...values].sort().join('') + Math.random()
}

export default async function Page() {
  await connection()

  const dataA = await getCachedData(
    (async function* () {
      yield 'a'
      yield 'b'
    })()
  )

  const dataB = await getCachedData(
    (async function* () {
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
