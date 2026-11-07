import { createDefaultCacheHandler } from 'next/dist/server/lib/cache-handlers/default'
import type { CacheEntry } from 'next/dist/server/lib/cache-handlers/types'

function createEntry(...chunks: Uint8Array[]): Promise<CacheEntry> {
  return Promise.resolve({
    value: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk)
        }
        controller.close()
      },
    }),
    tags: [],
    stale: 300,
    timestamp: Date.now(),
    expire: 3600,
    revalidate: 900,
  })
}

async function readChunks(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array[]> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  return chunks
}

describe('default "use cache" handler buffer storage', () => {
  it('does not retain a shared Buffer pool slab for small entries', async () => {
    const handler = createDefaultCacheHandler(50 * 1024 * 1024)

    // Each value is well below `Buffer.poolSize >>> 1`, so `Buffer.concat`
    // returns a slice of the shared pool slab for it.
    const valueSize = 1024
    expect(valueSize).toBeLessThan(Buffer.poolSize >>> 1)

    for (let i = 0; i < 20; i++) {
      await handler.set(
        `small-${i}`,
        createEntry(
          Buffer.alloc(valueSize / 2, i),
          Buffer.alloc(valueSize / 2, i)
        )
      )
    }

    for (let i = 0; i < 20; i++) {
      const entry = await handler.get(`small-${i}`, [])
      expect(entry).toBeDefined()

      const chunks = await readChunks(entry!.value)
      expect(chunks).toHaveLength(1)

      const [chunk] = chunks
      expect(chunk.byteLength).toBe(valueSize)
      // The backing store must be exactly as large as the counted size,
      // otherwise `cacheMaxMemorySize` undercounts the retained memory.
      expect(chunk.byteOffset).toBe(0)
      expect(chunk.buffer.byteLength).toBe(valueSize)
    }
  })

  it('preserves the stored bytes', async () => {
    const handler = createDefaultCacheHandler(50 * 1024 * 1024)

    await handler.set(
      'content',
      createEntry(Buffer.from('hello '), Buffer.from('world'))
    )

    const entry = await handler.get('content', [])
    const chunks = await readChunks(entry!.value)

    expect(Buffer.concat(chunks).toString()).toBe('hello world')
  })

  it('stores entries larger than the pool without an extra copy', async () => {
    const handler = createDefaultCacheHandler(50 * 1024 * 1024)
    const valueSize = Buffer.poolSize * 2

    await handler.set(
      'large',
      createEntry(
        Buffer.alloc(valueSize / 2, 1),
        Buffer.alloc(valueSize / 2, 2)
      )
    )

    const entry = await handler.get('large', [])
    const [chunk] = await readChunks(entry!.value)

    expect(chunk.byteLength).toBe(valueSize)
    expect(chunk.buffer.byteLength).toBe(valueSize)
    expect(chunk[0]).toBe(1)
    expect(chunk[valueSize - 1]).toBe(2)
  })
})
