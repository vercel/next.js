import { BatchedFileReader } from './batched-file-reader'
import type { FileReader } from './file-reader'

describe('CachedFileReader', () => {
  it('will only scan the filesystem a minimal amount of times', async () => {
    const pages = ['1', '2', '3']
    const app = ['4', '5', '6']

    const reader: FileReader = {
      read: jest.fn(async (directory: string) => {
        switch (directory) {
          case '<root>/pages':
            return pages
          case '<root>/app':
            return app
          default:
            throw new Error('unexpected')
        }
      }),
    }
    const cached = new BatchedFileReader(reader)

    const results = await Promise.all([
      cached.read('<root>/pages'),
      cached.read('<root>/pages'),
      cached.read('<root>/app'),
      cached.read('<root>/app'),
    ])

    expect(reader.read).toHaveBeenCalledTimes(2)
    expect(results).toHaveLength(4)
    expect(results[0]).toBe(pages)
    expect(results[1]).toBe(pages)
    expect(results[2]).toBe(app)
    expect(results[3]).toBe(app)
  })

  it('will send an error back only to the correct reader', async () => {
    const resolved: string[] = []
    const reader: FileReader = {
      read: jest.fn(async (directory: string) => {
        switch (directory) {
          case 'reject':
            throw new Error('rejected')
          case 'resolve':
            return resolved
          default:
            throw new Error('should not occur')
        }
      }),
    }
    const cached = new BatchedFileReader(reader)

    await Promise.all(
      ['reject', 'resolve', 'reject', 'resolve'].map(async (directory) => {
        if (directory === 'reject') {
          await expect(cached.read(directory)).rejects.toThrow('rejected')
        } else {
          await expect(cached.read(directory)).resolves.toEqual(resolved)
        }
      })
    )

    expect(reader.read).toHaveBeenCalledTimes(2)
  })
})
