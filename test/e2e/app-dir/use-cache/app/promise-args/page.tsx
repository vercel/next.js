import { connection } from 'next/server'

async function getCachedData(a: Promise<string>, b: Promise<string>) {
  'use cache'

  return (await a) + (await b) + new Date().toISOString()
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
}): [Promise<string>, Promise<string>] {
  let a: Promise<string>, b: Promise<string>

  if (resolveInReverseOrder) {
    // flip resolution order
    b = Promise.resolve('b')
    a = b.then(() => 'a')
  } else {
    a = Promise.resolve('a')
    b = a.then(() => 'b')
  }

  return [a, b]
}
