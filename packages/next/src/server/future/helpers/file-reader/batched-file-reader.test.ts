import { BatchedFileReader } from './batched-file-reader'
import { MockFileReader } from './helpers/mock-file-reader'

describe('BatchedFileReader', () => {
  const files: ReadonlyArray<string> = [
    '/root/a',
    '/root/b',
    '/root/c',
    '/root/d',
    '/root/e/f',
    '/root/e/g',
    '/root/e/h',
    '/root/e/i/j',
    '/root/e/i/k',
    '/root/e/i/l',
    '/root/m/n',
    '/root/m/o',
    '/root/m/p',
    '/root/q/r',
  ]

  let readSpy: jest.SpyInstance
  let reader: BatchedFileReader

  beforeEach(() => {
    const mocked = new MockFileReader(files)
    readSpy = jest.spyOn(mocked, 'read')
    reader = new BatchedFileReader(mocked)
  })

  it('should read a single file', async () => {
    const results = await reader.read('/root/q', { recursive: true })

    expect(results).toEqual(['/root/q/r'])
    expect(readSpy).toHaveBeenCalledTimes(1)
  })

  it('should read non-recursive directory', async () => {
    const results = await reader.read('/root/e', { recursive: false })

    let i = files.findIndex((file) => file.startsWith('/root/e'))
    for (; i < results.length; i++) {
      expect(results[i]).toBe(files[i])
    }

    expect(results).toHaveLength(3)
  })

  it('should handle empty directory', async () => {
    const results = await reader.read('/root/empty', { recursive: true })

    expect(results).toHaveLength(0)
    expect(readSpy).toHaveBeenCalledTimes(1)
  })

  it('should handle large directory and perform well', async () => {
    // Create a large directory with 10,000 files
    const largeDirFiles = []
    for (let i = 0; i < 10000; i++) {
      largeDirFiles.push(`/root/large-dir/file${i}.txt`)
    }

    const largeMocked = new MockFileReader(largeDirFiles)
    const largeReader = new BatchedFileReader(largeMocked)

    const startTime = performance.now()
    const results = await largeReader.read('/root/large-dir', {
      recursive: true,
    })

    const endTime = performance.now()
    const elapsedTime = endTime - startTime

    // Verify that all files were processed
    expect(results).toHaveLength(largeDirFiles.length)

    // Verify performance within a reasonable limit (arbitrary threshold of 500ms)
    expect(elapsedTime).toBeLessThan(500)
  })

  it('it should re-use the same read for the same directory', async () => {
    const promise1 = reader.read('/root', { recursive: true })
    const promise2 = reader.read('/root', { recursive: true })

    const [results1, results2] = await Promise.all([promise1, promise2])

    expect(results1).toBe(results2)
    expect(readSpy).toHaveBeenCalledTimes(1)

    for (let i = 0; i < results1.length; i++) {
      expect(results1[i]).toBe(files[i])
    }
  })

  it('should share the same read for nested reads', async () => {
    const promise1 = reader.read('/root', { recursive: true })
    const promise2 = reader.read('/root/e', { recursive: true })

    const [results1, results2] = await Promise.all([promise1, promise2])

    let i = 0
    for (const file of results1) {
      expect(file).toBe(files[i++])
    }

    i = files.findIndex((file) => file.startsWith('/root/e'))
    for (const file of results2) {
      expect(file).toBe(files[i++])
    }

    expect(readSpy).toHaveBeenCalledTimes(1)

    const promise3 = reader.read('/root/e', { recursive: true })
    const promise4 = reader.read('/root/e/i', { recursive: true })

    const [results3, results4] = await Promise.all([promise3, promise4])

    i = files.findIndex((file) => file.startsWith('/root/e'))
    for (const file of results3) {
      expect(file).toBe(files[i++])
    }

    i = files.findIndex((file) => file.startsWith('/root/e/i'))
    for (const file of results4) {
      expect(file).toBe(files[i++])
    }

    expect(readSpy).toHaveBeenCalledTimes(2)
  })

  it('should call the reader multiple times for unique reads', async () => {
    const promise1 = reader.read('/root/e', { recursive: true })
    const promise2 = reader.read('/root/m', { recursive: true })

    const [results1, results2] = await Promise.all([promise1, promise2])

    let i = files.findIndex((file) => file.startsWith('/root/e'))
    for (const file of results1) {
      expect(file).toBe(files[i++])
    }

    i = files.findIndex((file) => file.startsWith('/root/m'))
    for (const file of results2) {
      expect(file).toBe(files[i++])
    }

    expect(readSpy).toHaveBeenCalledTimes(2)
  })
})
