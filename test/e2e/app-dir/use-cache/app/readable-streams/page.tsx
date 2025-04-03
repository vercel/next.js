import { connection } from 'next/server'

async function getCachedData(stream: ReadableStream<string>) {
  'use cache'

  const reader = stream.getReader()
  const values: string[] = []

  while (true) {
    const result = await reader.read()

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
    new ReadableStream({
      start(controller) {
        controller.enqueue('a')
        controller.enqueue('b')
        controller.close()
      },
    })
  )

  const dataB = await getCachedData(
    new ReadableStream({
      start(controller) {
        controller.enqueue('b')
        controller.enqueue('a')
        controller.close()
      },
    })
  )

  return (
    <>
      <p id="a">{dataA}</p>
      <p id="b">{dataB}</p>
    </>
  )
}
