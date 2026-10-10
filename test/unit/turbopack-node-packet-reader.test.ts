/* eslint-env jest */
import { PacketReader } from '../../turbopack/crates/turbopack-node/js/src/child_process/packet-reader'

function frame(payload: string): Buffer {
  const body = Buffer.from(payload, 'utf8')
  const header = Buffer.alloc(4)
  header.writeUInt32BE(body.length, 0)
  return Buffer.concat([header, body])
}

const messages: unknown[] = [
  { a: 1 },
  'é'.repeat(1000),
  [1, 2, 3],
  { big: 'x'.repeat(70000) },
  null,
  'z',
]
const stream = Buffer.concat(messages.map((m) => frame(JSON.stringify(m))))

function splitEvery(buffer: Buffer, size: number): Buffer[] {
  const chunks: Buffer[] = []
  for (let i = 0; i < buffer.length; i += size) {
    chunks.push(buffer.subarray(i, i + size))
  }
  return chunks
}

function splitRandomly(buffer: Buffer, seed: number): Buffer[] {
  const chunks: Buffer[] = []
  for (let i = 0; i < buffer.length; ) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const size = 1 + (seed % 9000)
    chunks.push(buffer.subarray(i, i + size))
    i += size
  }
  return chunks
}

async function receiveAll(
  reader: PacketReader<unknown>,
  count: number
): Promise<unknown[]> {
  const received: unknown[] = []
  for (let i = 0; i < count; i++) {
    received.push(await reader.recv())
  }
  return received
}

describe('turbopack-node PacketReader', () => {
  it.each([
    ['in one chunk', () => [stream]],
    ['byte by byte', () => splitEvery(stream, 1)],
    ['in 3 byte chunks', () => splitEvery(stream, 3)],
    ['in random chunks', () => splitRandomly(stream, 42)],
  ])('decodes frames delivered %s', async (_name, split) => {
    const reader = new PacketReader<unknown>()
    for (const chunk of split()) {
      reader.push(chunk)
    }
    expect(await receiveAll(reader, messages.length)).toEqual(messages)
  })

  it('handles a chunk that ends one frame and starts the next header', async () => {
    const first = frame('"first"')
    const second = frame('"second"')
    const reader = new PacketReader<unknown>()
    reader.push(first.subarray(0, 5))
    reader.push(Buffer.concat([first.subarray(5), second.subarray(0, 2)]))
    reader.push(second.subarray(2))
    expect(await receiveAll(reader, 2)).toEqual(['first', 'second'])
  })

  it('resolves recv() calls that were pending before data arrived in order', async () => {
    const reader = new PacketReader<unknown>()
    const pending = messages.map(() => reader.recv())
    for (const chunk of splitRandomly(stream, 7)) {
      reader.push(chunk)
    }
    expect(await Promise.all(pending)).toEqual(messages)
  })

  it('keeps framing after a queued zero-length frame', async () => {
    const reader = new PacketReader<unknown>()
    reader.push(Buffer.concat([frame(''), frame('"after"')]))
    await expect(reader.recv()).rejects.toThrow(SyntaxError)
    expect(await reader.recv()).toBe('after')
  })

  it('throws from push() when a zero-length frame completes a pending recv()', () => {
    const reader = new PacketReader<unknown>()
    void reader.recv()
    expect(() => reader.push(frame(''))).toThrow(SyntaxError)
  })

  it('does not slice chunks that are consumed whole', async () => {
    const payload = Buffer.from('{"exact":true}', 'utf8')
    const header = Buffer.alloc(4)
    header.writeUInt32BE(payload.length, 0)
    const reader = new PacketReader<unknown>()
    const subarray = jest.spyOn(Buffer.prototype, 'subarray')
    try {
      reader.push(header)
      reader.push(payload)
      expect(subarray).not.toHaveBeenCalled()
    } finally {
      subarray.mockRestore()
    }
    // The payload chunk itself (not a copy or view of it) is what gets decoded.
    const toString = jest.spyOn(payload, 'toString')
    try {
      expect(await reader.recv()).toEqual({ exact: true })
      expect(toString).toHaveBeenCalledWith('utf8')
    } finally {
      toString.mockRestore()
    }
  })

  it('copies each byte of a fragmented frame at most once', async () => {
    const size = 4 * 1024 * 1024
    const payload = Buffer.alloc(size, 0x78)
    payload[0] = 0x22
    payload[size - 1] = 0x22
    const header = Buffer.alloc(4)
    header.writeUInt32BE(size, 0)
    const chunks = splitEvery(Buffer.concat([header, payload]), 64 * 1024)

    let copied = 0
    const originalCopy = Buffer.prototype.copy
    const originalConcat = Buffer.concat
    const copy = jest
      .spyOn(Buffer.prototype, 'copy')
      .mockImplementation(function (this: Buffer, ...args) {
        const count = originalCopy.apply(this, args)
        copied += count
        return count
      })
    const concat = jest
      .spyOn(Buffer, 'concat')
      .mockImplementation((...args) => {
        const result = originalConcat(...args)
        copied += result.length
        return result
      })
    const reader = new PacketReader<string>()
    try {
      for (const chunk of chunks) {
        reader.push(chunk)
      }
    } finally {
      copy.mockRestore()
      concat.mockRestore()
    }
    expect(copied).toBeLessThanOrEqual(size + 4)
    expect((await reader.recv()).length).toBe(size - 2)
  })
})
