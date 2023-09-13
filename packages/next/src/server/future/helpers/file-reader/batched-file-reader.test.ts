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
  ].sort()

  let readSpy: jest.SpyInstance
  let reader: BatchedFileReader

  beforeEach(() => {
    const mocked = new MockFileReader(files)
    readSpy = jest.spyOn(mocked, 'read')
    reader = new BatchedFileReader(mocked)
  })

  it('should read a single file', async () => {
    const iterator = reader.read('/root/q', { recursive: true })
    const result = await iterator.next()

    expect(result.done).toBe(false)
    expect(result.value).toBe('/root/q/r')

    expect(readSpy).toHaveBeenCalledTimes(1)

    const result2 = await iterator.next()

    expect(result2.done).toBe(true)
    expect(result2.value).toBeUndefined()

    expect(readSpy).toHaveBeenCalledTimes(1)
  })

  it('should read non-recursive directory', async () => {
    const iterator = reader.read('/root/e', { recursive: false })

    let results = 0
    let i = files.findIndex((file) => file.startsWith('/root/e'))
    for await (const file of iterator) {
      expect(file).toBe(files[i])
      results++
      i++
    }

    expect(results).toBe(3)
  })

  it('should handle empty directory', async () => {
    const iterator = reader.read('/root/empty', { recursive: true })
    const result = await iterator.next()

    expect(result.done).toBe(true)
    expect(result.value).toBeUndefined()
  })

  it('should handle large directory and perform well', async () => {
    // Create a large directory with 10,000 files
    const largeDirFiles = []
    for (let i = 0; i < 10000; i++) {
      largeDirFiles.push(`/root/large-dir/file${i}.txt`)
    }

    const largeMocked = new MockFileReader(largeDirFiles)
    const largeReader = new BatchedFileReader(largeMocked)

    const iterator = largeReader.read('/root/large-dir', { recursive: true })

    const startTime = performance.now()
    let count = 0

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const file of iterator) {
      count++
    }

    const endTime = performance.now()
    const elapsedTime = endTime - startTime

    // Verify that all files were processed
    expect(count).toBe(largeDirFiles.length)

    // Verify performance within a reasonable limit (arbitrary threshold of 500ms)
    expect(elapsedTime).toBeLessThan(500)
  })

  it('it should re-use the same generator for the same directory', async () => {
    const iterator1 = reader.read('/root', { recursive: true })
    const iterator2 = reader.read('/root', { recursive: true })

    let i = 0
    for await (const file of iterator1) {
      expect(file).toBe(files[i++])
    }

    i = 0
    for await (const file of iterator2) {
      expect(file).toBe(files[i++])
    }

    expect(readSpy).toHaveBeenCalledTimes(1)
  })

  it('should share the same generator for nested reads', async () => {
    const iterator4 = reader.read('/root', { recursive: true })
    const iterator5 = reader.read('/root/e', { recursive: true })

    let i = 0
    for await (const file of iterator4) {
      expect(file).toBe(files[i++])
    }

    i = files.findIndex((file) => file.startsWith('/root/e'))
    for await (const file of iterator5) {
      expect(file).toBe(files[i++])
    }

    expect(readSpy).toHaveBeenCalledTimes(1)

    const iterator6 = reader.read('/root/e', { recursive: true })
    const iterator7 = reader.read('/root/e/i', { recursive: true })

    i = files.findIndex((file) => file.startsWith('/root/e'))
    for await (const file of iterator6) {
      expect(file).toBe(files[i++])
    }

    i = files.findIndex((file) => file.startsWith('/root/e/i'))
    for await (const file of iterator7) {
      expect(file).toBe(files[i++])
    }

    expect(readSpy).toHaveBeenCalledTimes(2)
  })

  it('should call the generator multiple times for unique reads', async () => {
    const iterator8 = reader.read('/root/e', { recursive: true })
    const iterator9 = reader.read('/root/m', { recursive: true })

    let i = files.findIndex((file) => file.startsWith('/root/e'))
    for await (const file of iterator8) {
      expect(file).toBe(files[i++])
    }

    i = files.findIndex((file) => file.startsWith('/root/m'))
    for await (const file of iterator9) {
      expect(file).toBe(files[i++])
    }

    expect(readSpy).toHaveBeenCalledTimes(2)
  })
})
