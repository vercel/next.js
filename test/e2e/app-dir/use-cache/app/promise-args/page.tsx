import { connection } from 'next/server'

async function getCachedData(
  a: Promise<{ promise: Promise<string> }>,
  b: Promise<{ promise: Promise<string> }>
) {
  'use cache'

  const { promise: promiseA } = await a
  const { promise: promiseB } = await b

  return (await promiseA) + (await promiseB) + new Date().toISOString()
}

export default async function Page() {
  await connection()

  const dataA = await getCachedData(
    ...createPromises({
      resolveInReverseOrder: false,
    })
  )

  const dataB = await getCachedData(
    ...createPromises({
      resolveInReverseOrder: true,
    })
  )

  return (
    <>
      <p id="a">{dataA}</p>
      <p id="b">{dataB}</p>
    </>
  )
}

function createPromises({
  resolveInReverseOrder,
}: {
  resolveInReverseOrder: boolean
}): [
  Promise<{ promise: Promise<string> }>,
  Promise<{ promise: Promise<string> }>,
] {
  let a: Promise<{ promise: Promise<string> }>
  let b: Promise<{ promise: Promise<string> }>

  if (resolveInReverseOrder) {
    // flip resolution order
    b = Promise.resolve({ promise: Promise.resolve('b') })
    a = b.then(() => ({ promise: Promise.resolve('a') }))
  } else {
    a = Promise.resolve({ promise: Promise.resolve('a') })
    b = a.then(() => ({ promise: Promise.resolve('b') }))
  }

  return [a, b]
}
