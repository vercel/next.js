import type { IncomingMessage } from 'http'
import { Readable } from 'stream'
import { getCloneableBody } from 'next/dist/server/body-streams'

function mockIncoming(body: string): IncomingMessage {
  const readable = new Readable({ read() {} })
  process.nextTick(() => {
    readable.push(Buffer.from(body))
    readable.push(null)
  })
  return readable as unknown as IncomingMessage
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function readAllWeb(stream: Readable, timeoutMs = 1000): Promise<Buffer> {
  let timeout: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('Timed out reading stream via Readable.toWeb()'))
    }, timeoutMs)
  })

  try {
    return await Promise.race([
      (async () => {
        const web = Readable.toWeb(stream)
        const reader = web.getReader()
        const out: Buffer[] = []

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          out.push(Buffer.from(value))
        }

        return Buffer.concat(out)
      })(),
      timeoutPromise,
    ])
  } finally {
    clearTimeout(timeout!)
  }
}

describe('getCloneableBody', () => {
  // Regression test for https://github.com/vercel/next.js/issues/95335
  //
  // After middleware clones the request body and `finalize()` swaps the buffered
  // stream back onto the request, the request must stay a plain Readable. The
  // buffered stream used to be a Duplex (PassThrough) whose writable-side
  // internals (`_writableState`, `write`, `end`, ...) were copied onto the
  // IncomingMessage, so a downstream handler reading a POST body via
  // `Readable.toWeb()` saw an unfinished writable side and hung forever.
  it('leaves the finalized request body consumable via Readable.toWeb()', async () => {
    const body = 'hello world'
    const req = mockIncoming(body)

    const cloneable = getCloneableBody(req)
    const middlewareCopy = cloneable.cloneBodyStream()

    // Middleware consumes its own copy of the body (e.g. via NextResponse.next()).
    expect((await readAll(middlewareCopy)).toString()).toBe(body)

    await cloneable.finalize()

    // The request must not masquerade as a writable stream after finalize.
    expect((req as any)._writableState).toBeUndefined()
    expect((req as any).write).toBeUndefined()
    expect((req as any).end).toBeUndefined()
    expect((await readAllWeb(req as unknown as Readable)).toString()).toBe(body)
  })
})
