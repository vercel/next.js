import {
  createBufferedTransformStream,
  createInsertedHTMLStream,
} from './stream-utils.node'
import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server.node'
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

function createInput(app = <App />): Promise<PassThrough> {
  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(app, {
      onAllReady() {
        resolve(pipe(new PassThrough()))
      },
      onShellError(error) {
        reject(error)
      },
    })
  })
}

describe('createBufferedTransformStream', () => {
  it('should return a TransformStream that buffers input chunks across rendering boundaries', (done) => {
    createInput().then((input) => {
      const stream = input.pipe(createBufferedTransformStream())
      const actualChunks = []
      stream.on('data', (chunk) => {
        actualChunks.push(chunk)
      })

      stream.resume()

      stream.on('finish', () => {
        expect(actualChunks.length).toBe(1)
        done()
      })
    })
  })
})

describe('createInsertedHTMLStream', () => {
  it('should insert html to the beginning of the stream', async () => {
    const insertedHTML = '<foo></foo>'
    const stream = createInsertedHTMLStream(() => Promise.resolve(insertedHTML))
    const input = await createInput()
    const output = input.pipe(stream)

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

    console.log(actualChunks)

    expect(actualChunks.length).toBe(2)
    const encoder = new TextEncoder()
    const expected = encoder.encode(insertedHTML)
    expect(actualChunks[0].indexOf(expected)).toBe(0)
    expect(
      new Uint8Array(actualChunks[0].subarray(expected.length))
    ).toStrictEqual(expected)
  })
})
