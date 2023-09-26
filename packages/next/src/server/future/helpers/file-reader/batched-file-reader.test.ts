import path from 'path'
import { BatchedFileReader } from './batched-file-reader'
import { MockFileReader, PosixMockFileReader } from './helpers/mock-file-reader'

describe('BatchedFileReader', () => {
  describe('findOrCreateShared', () => {
    it('returns the same instance for the same reader', () => {
      const reader1 = new PosixMockFileReader()
      const batched1 = BatchedFileReader.findOrCreateShared(reader1)
      const batched2 = BatchedFileReader.findOrCreateShared(reader1)

      expect(batched1).toBe(batched2)
    })

    it('returns different instances for different readers', () => {
      const reader1 = new PosixMockFileReader()
      const reader2 = new PosixMockFileReader()
      const batched1 = BatchedFileReader.findOrCreateShared(reader1)
      const batched2 = BatchedFileReader.findOrCreateShared(reader2)

      expect(batched1).not.toBe(batched2)
    })
  })

  describe.each([
    { name: 'win32', sep: path.win32.sep, normalize: path.win32.normalize },
    { name: 'posix', sep: path.posix.sep, normalize: path.posix.normalize },
  ])('on $name', ({ sep, normalize }) => {
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
    ].map((file) => normalize(file))

    let readSpy: jest.SpyInstance
    let reader: BatchedFileReader

    beforeEach(() => {
      const mocked = new MockFileReader(files, sep)
      readSpy = jest.spyOn(mocked, 'read')
      reader = new BatchedFileReader(mocked, sep)
    })

    it('should read a single file', async () => {
      const results = await reader.read(normalize('/root/q'), {
        recursive: true,
      })

      expect(results).toEqual([normalize('/root/q/r')])
      expect(readSpy).toHaveBeenCalledTimes(1)
    })

    it('should read non-recursive directory', async () => {
      const results = await reader.read(normalize('/root/e'), {
        recursive: false,
      })

      let i = files.findIndex((file) => file.startsWith(normalize('/root/e')))
      for (; i < results.length; i++) {
        expect(results[i]).toBe(files[i])
      }

      expect(results).toHaveLength(3)
    })

    it('should handle empty directory', async () => {
      const results = await reader.read(normalize('/root/empty'), {
        recursive: true,
      })

      expect(results).toHaveLength(0)
      expect(readSpy).toHaveBeenCalledTimes(1)
    })

    it('should handle large directory and perform well', async () => {
      // Create a large directory with 10,000 files
      const largeDirFiles = []
      for (let i = 0; i < 10000; i++) {
        largeDirFiles.push(normalize(`/root/large-dir/file${i}.txt`))
      }

      const largeMocked = new MockFileReader(largeDirFiles, sep)
      const largeReader = new BatchedFileReader(largeMocked, sep)

      const startTime = performance.now()
      const results = await largeReader.read(normalize('/root/large-dir'), {
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
      const promise1 = reader.read(normalize('/root'), { recursive: true })
      const promise2 = reader.read(normalize('/root'), { recursive: true })
      const promise3 = reader.read(normalize('/root'), { recursive: true })

      const [results1, results2, results3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ])

      expect(results1).toBe(results2)
      expect(results2).toBe(results3)
      expect(readSpy).toHaveBeenCalledTimes(1)

      for (let i = 0; i < results1.length; i++) {
        expect(results1[i]).toBe(files[i])
      }
    })

    it('should share the same read for nested reads', async () => {
      const promise1 = reader.read(normalize('/root'), { recursive: true })
      const promise2 = reader.read(normalize('/root/e'), { recursive: true })

      const [results1, results2] = await Promise.all([promise1, promise2])

      let i = 0
      for (const file of results1) {
        expect(file).toBe(files[i++])
      }

      i = files.findIndex((file) => file.startsWith(normalize('/root/e')))
      for (const file of results2) {
        expect(file).toBe(files[i++])
      }

      expect(readSpy).toHaveBeenCalledTimes(1)

      const promise3 = reader.read(normalize('/root/e'), { recursive: true })
      const promise4 = reader.read(normalize('/root/e/i'), { recursive: true })

      const [results3, results4] = await Promise.all([promise3, promise4])

      i = files.findIndex((file) => file.startsWith(normalize('/root/e')))
      for (const file of results3) {
        expect(file).toBe(files[i++])
      }

      i = files.findIndex((file) => file.startsWith(normalize('/root/e/i')))
      for (const file of results4) {
        expect(file).toBe(files[i++])
      }

      expect(readSpy).toHaveBeenCalledTimes(2)
    })

    it('should call the reader multiple times for unique reads', async () => {
      const promise1 = reader.read(normalize('/root/e'), { recursive: true })
      const promise2 = reader.read(normalize('/root/m'), { recursive: true })

      const [results1, results2] = await Promise.all([promise1, promise2])

      let i = files.findIndex((file) => file.startsWith(normalize('/root/e')))
      for (const file of results1) {
        expect(file).toBe(files[i++])
      }

      i = files.findIndex((file) => file.startsWith(normalize('/root/m')))
      for (const file of results2) {
        expect(file).toBe(files[i++])
      }

      expect(readSpy).toHaveBeenCalledTimes(2)
    })
  })
})
