import {
  createBufferedTransformStream,
  streamToString,
} from './stream-utils.node'
import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server.node'
import { Suspense } from 'react'
import { StringDecoder } from 'node:string_decoder'

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

function createInput(app = <App />): Promise<PassThrough> {
  return new Promise((resolve) => {
    const { pipe } = renderToPipeableStream(app, {
      onShellReady() {
        const pt = new PassThrough()
        pipe(pt)
        resolve(pt)
      },
    })
  })
}

describe('createBufferedTransformStream', () => {
  it('should return a TransformStream that buffers input chunks across rendering boundaries', async () => {
    const stream = createBufferedTransformStream()
    const input = await createInput()
    // This is essentially equivalent to a ReadableStream.tee()
    // The important part is that both `pipe` calls happen before any read operation do.
    const output = input.pipe(stream)
    const expectedOutput = input.pipe(new PassThrough())

    const actualChunks = await new Promise<Buffer[]>((resolve) => {
      const chunks: Buffer[] = []
      output.on('readable', () => {
        let chunk
        while (null !== (chunk = output.read())) {
          chunks.push(chunk)
        }
      })
      output.on('end', () => {
        resolve(chunks)
      })
    })

    const expected = await streamToString(expectedOutput)

    // React will send the suspense boundary piece second
    expect(actualChunks.length).toBe(2)

    let actual = ''
    const decoder = new StringDecoder()
    for (const chunk of actualChunks) {
      actual += decoder.write(chunk)
    }
    actual += decoder.end()

    expect(actual).toStrictEqual(expected)
  })
})
