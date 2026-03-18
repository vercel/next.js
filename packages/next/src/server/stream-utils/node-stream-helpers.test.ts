import { Readable, PassThrough } from 'node:stream'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import {
  chainNodeStreams,
  createBufferedTransformNode,
  createInlinedDataNodeStream,
  pipeNodeReadableToResponse,
  nodeStreamToBuffer,
  nodeStreamToString,
} from './node-stream-helpers'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a Readable that emits the given strings as Buffer chunks. */
function readableFrom(chunks: string[]): Readable {
  const buffers = chunks.map((c) => Buffer.from(c, 'utf-8'))
  let index = 0
  return new Readable({
    read() {
      if (index < buffers.length) {
        this.push(buffers[index++])
      } else {
        this.push(null)
      }
    },
  })
}

/** Collect all data from a Readable into a UTF-8 string. */
async function collectString(readable: Readable): Promise<string> {
  return nodeStreamToString(readable)
}

/** Delay helper for async tests */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// chainNodeStreams
// ---------------------------------------------------------------------------

describe('chainNodeStreams', () => {
  it('returns an empty (ended) stream when called with no arguments', async () => {
    const result = chainNodeStreams()
    const str = await collectString(result)
    expect(str).toBe('')
  })

  it('returns the same stream when called with a single argument', () => {
    const source = readableFrom(['hello'])
    const result = chainNodeStreams(source)
    // Should be the exact same object, not a wrapper.
    expect(result).toBe(source)
  })

  it('chains two streams in order', async () => {
    const a = readableFrom(['hello '])
    const b = readableFrom(['world'])
    const result = await collectString(chainNodeStreams(a, b))
    expect(result).toBe('hello world')
  })

  it('chains three streams in order', async () => {
    const a = readableFrom(['a'])
    const b = readableFrom(['b'])
    const c = readableFrom(['c'])
    const result = await collectString(chainNodeStreams(a, b, c))
    expect(result).toBe('abc')
  })

  it('handles streams that emit multiple chunks', async () => {
    const a = readableFrom(['chunk1-', 'chunk2-'])
    const b = readableFrom(['chunk3'])
    const result = await collectString(chainNodeStreams(a, b))
    expect(result).toBe('chunk1-chunk2-chunk3')
  })

  it('propagates errors from a source stream', async () => {
    const errStream = new Readable({
      read() {
        this.destroy(new Error('test error'))
      },
    })
    const b = readableFrom(['b'])

    const chained = chainNodeStreams(errStream, b)

    await expect(collectString(chained)).rejects.toThrow('test error')
  })
})

// ---------------------------------------------------------------------------
// createBufferedTransformNode
// ---------------------------------------------------------------------------

describe('createBufferedTransformNode', () => {
  it('buffers small chunks and flushes them as a single chunk', async () => {
    const source = readableFrom(['a', 'b', 'c'])
    const transform = createBufferedTransformNode()

    const output = source.pipe(transform)
    const result = await nodeStreamToBuffer(output)

    // All three tiny chunks should have been merged.
    // The exact number of output chunks depends on timing, but the
    // concatenated result must be correct.
    expect(result.toString('utf-8')).toBe('abc')
  })

  it('flushes immediately when maxBufferBytes is reached', async () => {
    const transform = createBufferedTransformNode(5)
    const outputChunks: Buffer[] = []

    transform.on('data', (chunk: Buffer) => {
      outputChunks.push(chunk)
    })

    const done = new Promise<void>((resolve) => {
      transform.on('end', resolve)
    })

    // Write a chunk that exceeds the buffer limit.
    transform.write(Buffer.from('hello world'))
    transform.end()

    await done

    // The first chunk should have been flushed synchronously because it
    // exceeded the buffer limit.
    expect(Buffer.concat(outputChunks).toString('utf-8')).toBe('hello world')
  })

  it('flushes remaining data when the stream ends', async () => {
    const source = readableFrom(['partial'])
    const transform = createBufferedTransformNode(1024)

    const output = source.pipe(transform)
    const result = await collectString(output)
    expect(result).toBe('partial')
  })
})

// ---------------------------------------------------------------------------
// createInlinedDataNodeStream
// ---------------------------------------------------------------------------

describe('createInlinedDataNodeStream', () => {
  it('inlines data chunks alongside HTML chunks (no delay)', async () => {
    const dataStream = readableFrom(['<script>data1</script>'])
    const transform = createInlinedDataNodeStream(dataStream, false)

    const htmlStream = readableFrom(['<html>', '</html>'])
    const output = htmlStream.pipe(transform)

    const result = await collectString(output)
    // HTML chunks should appear, and data should be interleaved.
    expect(result).toContain('<html>')
    expect(result).toContain('</html>')
    expect(result).toContain('<script>data1</script>')
  })

  it('delays data until first HTML chunk when delayDataUntilFirstHtmlChunk=true', async () => {
    const dataStream = readableFrom(['<script>delayed</script>'])
    const transform = createInlinedDataNodeStream(dataStream, true)

    const htmlStream = readableFrom(['<html>shell</html>'])
    const output = htmlStream.pipe(transform)

    const result = await collectString(output)
    expect(result).toContain('<html>shell</html>')
    expect(result).toContain('<script>delayed</script>')
  })

  it('handles empty data stream', async () => {
    const dataStream = readableFrom([])
    const transform = createInlinedDataNodeStream(dataStream, false)

    const htmlStream = readableFrom(['<html>content</html>'])
    const output = htmlStream.pipe(transform)

    const result = await collectString(output)
    expect(result).toBe('<html>content</html>')
  })

  it('handles data arriving after HTML finishes', async () => {
    // Create a data stream that emits after a delay.
    const dataPassthrough = new PassThrough()
    const transform = createInlinedDataNodeStream(dataPassthrough, false)

    const htmlStream = readableFrom(['<html>'])
    const output = htmlStream.pipe(transform)

    // Emit data after a small delay.
    setTimeout(() => {
      dataPassthrough.write(Buffer.from('<script>late</script>'))
      dataPassthrough.end()
    }, 50)

    const result = await collectString(output)
    expect(result).toContain('<html>')
    expect(result).toContain('<script>late</script>')
  })
})

// ---------------------------------------------------------------------------
// pipeNodeReadableToResponse
// ---------------------------------------------------------------------------

describe('pipeNodeReadableToResponse', () => {
  let server: Server

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('pipes readable data to a ServerResponse', async () => {
    const received = new Promise<string>((resolve, reject) => {
      server = createServer((req, res) => {
        const source = readableFrom(['hello', ' ', 'world'])
        pipeNodeReadableToResponse(source, res, () => {
          // onEnd callback should fire.
        })
      })

      server.listen(0, () => {
        const { port } = server.address() as AddressInfo
        fetch(`http://127.0.0.1:${port}`)
          .then((r) => r.text())
          .then(resolve)
          .catch(reject)
      })
    })

    expect(await received).toBe('hello world')
  })

  it('handles already-destroyed responses gracefully', () => {
    // Simulate a destroyed response (e.g. client disconnected).
    const fakeRes = {
      destroyed: true,
      writableEnded: false,
      flushHeaders: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      pipe: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
    } as any

    const source = readableFrom(['data'])
    const onEnd = jest.fn()

    // Should not throw.
    pipeNodeReadableToResponse(source, fakeRes, onEnd)
    expect(onEnd).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// nodeStreamToBuffer / nodeStreamToString
// ---------------------------------------------------------------------------

describe('nodeStreamToBuffer', () => {
  it('collects all chunks into a Buffer', async () => {
    const source = readableFrom(['hello', ' ', 'world'])
    const buf = await nodeStreamToBuffer(source)
    expect(buf.toString('utf-8')).toBe('hello world')
  })

  it('returns an empty Buffer for an empty stream', async () => {
    const source = readableFrom([])
    const buf = await nodeStreamToBuffer(source)
    expect(buf.length).toBe(0)
  })
})

describe('nodeStreamToString', () => {
  it('collects all chunks into a string', async () => {
    const source = readableFrom(['foo', 'bar'])
    const str = await nodeStreamToString(source)
    expect(str).toBe('foobar')
  })

  it('handles multi-byte UTF-8 characters split across chunks', async () => {
    // The emoji is 4 bytes: f0 9f 98 80
    const emoji = Buffer.from('\u{1F600}')
    expect(emoji.length).toBe(4)

    // Split the 4-byte sequence across two chunks.
    const chunk1 = emoji.subarray(0, 2) // f0 9f
    const chunk2 = emoji.subarray(2, 4) // 98 80

    let index = 0
    const parts = [chunk1, chunk2]
    const source = new Readable({
      read() {
        if (index < parts.length) {
          this.push(parts[index++])
        } else {
          this.push(null)
        }
      },
    })

    const str = await nodeStreamToString(source)
    expect(str).toBe('\u{1F600}')
  })
})
