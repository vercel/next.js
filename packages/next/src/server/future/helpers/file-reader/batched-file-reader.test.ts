import { BatchedFileReader } from './batched-file-reader'
import { FileReader } from './file-reader'

describe('CachedFileReader', () => {
  it('will only scan the filesystem a minimal amount of times', async () => {
    const pages = ['1', '2', '3'].map((name) => `<root>/pages/${name}`)
    const app = ['4', '5', '6'].map((name) => `<root>/app/${name}`)

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
      cached.read('<root>/pages', { recursive: true }),
      cached.read('<root>/pages', { recursive: true }),
      cached.read('<root>/app', { recursive: true }),
      cached.read('<root>/app', { recursive: true }),
    ])

    expect(reader.read).toBeCalledTimes(2)
    expect(results).toHaveLength(4)
    expect(results[0]).toEqual(pages)
    expect(results[0]).toBe(results[1])

    expect(results[2]).toEqual(app)
    expect(results[2]).toBe(results[3])
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
          await expect(
            cached.read(directory, { recursive: true })
          ).rejects.toThrowError('rejected')
        } else {
          await expect(
            cached.read(directory, { recursive: true })
          ).resolves.toEqual(resolved)
        }
      })
    )

    expect(reader.read).toBeCalledTimes(2)
  })
})
