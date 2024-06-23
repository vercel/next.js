import {
  continueFizzStream,
  createBufferedTransformStream,
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

      stream.on('end', () => {
        expect(actualChunks.length).toBe(1)
        done()
      })
    })
  })
})

describe('continueFizzStream', () => {
  it.only('should passthrough render stream and buffered transform stream', (done) => {
    createInput().then((input) => {
      continueFizzStream(input, {
        isStaticGeneration: false,
        serverInsertedHTMLToHead: false,
      }).then((stream) => {
        const actualChunks: Uint8Array[] = []
        stream.on('data', (chunk) => {
          actualChunks.push(chunk)
        })

        stream.resume()

        stream.on('end', () => {
          console.log('ended')
          expect(actualChunks.length).toBe(2)
          console.log(actualChunks[0].toString())
          done()
        })
      })
    })
  })
})
