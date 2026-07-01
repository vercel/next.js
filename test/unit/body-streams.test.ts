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

    // Reading the finalized body with the standard Node API must not hang.
    const web = Readable.toWeb(req as unknown as Readable)
    const reader = web.getReader()
    const out: Buffer[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      out.push(Buffer.from(value as Uint8Array))
    }
    expect(Buffer.concat(out).toString()).toBe(body)
  })
})
