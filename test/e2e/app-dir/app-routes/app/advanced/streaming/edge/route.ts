export const runtime = 'edge'

function iteratorToStream(iterator: any) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next()

      if (done) {
        controller.close()
      } else {
        controller.enqueue(value)
      }
    },
  })
}

const encoder = new TextEncoder()

async function* makeIterator() {
  yield encoder.encode('<p>one</p>')
  await new Promise((resolve) => {
    setTimeout(resolve, 200)
  })
  yield encoder.encode('<p>two</p>')
  await new Promise((resolve) => {
    setTimeout(resolve, 200)
  })
  yield encoder.encode('<p>three</p>')
}

export async function GET() {
  const iterator = makeIterator()
  const stream = iteratorToStream(iterator)

  return new Response(stream)
}
