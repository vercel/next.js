import { createBufferedTransformStream } from './stream-utils.edge'
import { renderToReadableStream } from 'react-dom/server.edge'
import { Suspense } from 'react'

function App() {
  const Data = async () => {
    const data = await Promise.resolve('1')
    return <h2>{data}</h2>
  }

  return (
    <html>
      <head>
        <title>My App</title>
      </head>
      <body>
        <h1>Hello, World!</h1>
        <Suspense fallback={<h2>Fallback</h2>}>
          <Data />
        </Suspense>
      </body>
    </html>
  )
}

async function createInput(app = <App />): Promise<ReadableStream<Uint8Array>> {
  const stream = await renderToReadableStream(app)
  await stream.allReady
  return stream
}

describe('createBufferedTransformStream', () => {
  it('should return a TransformStream that buffers input chunks across rendering boundaries', async () => {
    const input = await createInput()
    const actualStream = input.pipeThrough(createBufferedTransformStream())

    const actualChunks = []
    // @ts-expect-error
    for await (const chunks of actualStream) {
      actualChunks.push(chunks)
    }

    expect(actualChunks.length).toBe(1)
  })
})
