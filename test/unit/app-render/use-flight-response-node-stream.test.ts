import { Readable } from 'node:stream'

import { createInlinedDataNodeStream } from 'next/dist/server/app-render/use-flight-response'

async function collectToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

describe('createInlinedDataNodeStream', () => {
  it('emits bootstrap script even when no chunks are provided', async () => {
    const source = Readable.from([])
    const transformed = source.pipe(
      createInlinedDataNodeStream(undefined, null)
    )
    const output = await collectToString(transformed)

    expect(output).toContain('(self.__next_f=self.__next_f||[]).push([0])')
  })

  it('encodes UTF-8 chunks as data payloads', async () => {
    const source = Readable.from([Buffer.from('hello')])
    const transformed = source.pipe(
      createInlinedDataNodeStream(undefined, null)
    )
    const output = await collectToString(transformed)

    expect(output).toContain('self.__next_f.push([1,"hello"])')
    expect(output).not.toContain('self.__next_f.push([3,"')
  })

  it('encodes invalid UTF-8 chunks as binary payloads', async () => {
    const source = Readable.from([Buffer.from([0xff, 0xfe, 0xfd])])
    const transformed = source.pipe(
      createInlinedDataNodeStream(undefined, null)
    )
    const output = await collectToString(transformed)

    expect(output).toContain('self.__next_f.push([3,"//79"])')
  })

  it('handles multi-byte UTF-8 split across chunks', async () => {
    const source = Readable.from([
      Buffer.from([0xe2]),
      Buffer.from([0x9c, 0x93]),
    ])
    const transformed = source.pipe(
      createInlinedDataNodeStream(undefined, null)
    )
    const output = await collectToString(transformed)

    expect(output).toContain('self.__next_f.push([1,')
    expect(output).toContain('✓')
    expect(output).not.toContain('self.__next_f.push([3,"')
  })
})
