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

  it('decodes chunks that are consumed whole without slicing them', async () => {
    const payload = Buffer.from('{"exact":true}', 'utf8')
    const header = Buffer.alloc(4)
    header.writeUInt32BE(payload.length, 0)
    const reader = new PacketReader<unknown>()
    const subarray = jest.spyOn(Buffer.prototype, 'subarray')
    // The payload chunk itself (not a copy or view of it) is what gets decoded.
    const toString = jest.spyOn(payload, 'toString')
    try {
      reader.push(header)
      reader.push(payload)
      expect(subarray).not.toHaveBeenCalled()
      expect(toString.mock.calls).toEqual([['utf8', 0, payload.length]])
    } finally {
      subarray.mockRestore()
      toString.mockRestore()
    }
    expect(await reader.recv()).toEqual({ exact: true })
  })

  describe('matches Buffer#toString decoding for every split point', () => {
    // Captures the decoded strings by bypassing JSON.parse, so invalid JSON
    // (e.g. a truncated sequence) can be compared too. All payloads are
    // sent as consecutive frames, so decoder state must not leak between them.
    async function check(...payloads: Buffer[]) {
      const stream = Buffer.concat(
        payloads.map((payload) => {
          const header = Buffer.alloc(4)
          header.writeUInt32BE(payload.length, 0)
          return Buffer.concat([header, payload])
        })
      )
      const expected = payloads.map((payload) => payload.toString('utf8'))
      for (let split = 1; split < stream.length; split++) {
        const reader = new PacketReader<unknown>()
        reader.push(stream.subarray(0, split))
        reader.push(stream.subarray(split))
        const parse = jest.spyOn(JSON, 'parse').mockImplementation((s) => s)
        let decoded: unknown[]
        try {
          decoded = await receiveAll(reader, payloads.length)
        } finally {
          parse.mockRestore()
        }
        expect({ split, decoded }).toEqual({ split, decoded: expected })
      }
    }

    it('multi-byte characters', async () => {
      await check(Buffer.from(JSON.stringify('aé€😀bé€😀'), 'utf8'))
    })

    it('invalid UTF-8 sequences', async () => {
      await check(
        Buffer.from([
          0x22, 0xff, 0x41, 0xe2, 0x82, 0x41, 0xf0, 0x9f, 0x98, 0x41, 0xc0,
          0xaf, 0xed, 0xa0, 0x80, 0xf4, 0x90, 0x80, 0x80, 0x22,
        ])
      )
    })

    it.each([
      ['2-byte', [0xc3]],
      ['3-byte', [0xe2, 0x82]],
      ['4-byte', [0xf0, 0x9f, 0x98]],
    ])(
      'a truncated %s sequence at the end of a frame',
      async (_name, truncated) => {
        await check(
          Buffer.from([0x22, 0x61, ...truncated]),
          Buffer.from('"b"', 'utf8')
        )
      }
    )
  })

  it('does not retain received chunks in queued packets', async () => {
    const first = frame('"first"')
    const second = frame('"second"')
    const reader = new PacketReader<unknown>()
    // One frame decoded from a single chunk, one spanning two chunks.
    const chunks = [first, second.subarray(0, 6), second.subarray(6)].map(
      (chunk) => Buffer.from(chunk)
    )
    for (const chunk of chunks) {
      reader.push(chunk)
    }
    for (const chunk of chunks) {
      chunk.fill(0x20)
    }
    expect(await receiveAll(reader, 2)).toEqual(['first', 'second'])
  })

  it('does not assemble fragmented payloads into a Buffer', async () => {
    const size = 4 * 1024 * 1024
    const payload = Buffer.alloc(size, 0x78)
    payload[0] = 0x22
    payload[size - 1] = 0x22
    const header = Buffer.alloc(4)
    header.writeUInt32BE(size, 0)
    const chunks = splitEvery(Buffer.concat([header, payload]), 64 * 1024)

    const copy = jest.spyOn(Buffer.prototype, 'copy')
    const concat = jest.spyOn(Buffer, 'concat')
    const allocUnsafe = jest.spyOn(Buffer, 'allocUnsafe')
    const reader = new PacketReader<string>()
    try {
      for (const chunk of chunks) {
        reader.push(chunk)
      }
      expect(copy).not.toHaveBeenCalled()
      expect(concat).not.toHaveBeenCalled()
      expect(allocUnsafe).not.toHaveBeenCalled()
    } finally {
      copy.mockRestore()
      concat.mockRestore()
      allocUnsafe.mockRestore()
    }
    expect(await reader.recv()).toBe('x'.repeat(size - 2))
  })
})
