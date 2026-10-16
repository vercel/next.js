import { once } from 'node:events'
import { PassThrough, Readable } from 'node:stream'
import { createNodeInlinedDataStream } from 'next/dist/server/app-render/stream-ops.node'

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

describe('Node inline Flight data', () => {
  it('propagates an encoder error that occurred before hydration started', async () => {
    const source = new PassThrough()
    const error = new Error('encoder failed before hydration started')
    const sourceError = once(source, 'error')
    source.destroy(error)
    await sourceError

    await expect(
      collect(createNodeInlinedDataStream(source, undefined, null) as Readable)
    ).rejects.toBe(error)
  })
})
