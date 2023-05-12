import { BatchedFileWriter } from './batched-file-writer'

describe('BatchedFileWriter', () => {
  it('will not create directories that have already been created', async () => {
    const fs = {
      mkdir: jest.fn(),
      writeFile: jest.fn(),
    }

    const writer = new BatchedFileWriter(fs)

    writer.write('/foo/bar/baz.txt', 'baz')
    writer.write('/foo/bar/qux.txt', 'qux')
    writer.write('/foo/bar/quux/index.txt', 'quux')

    await writer.flush()

    expect(fs.mkdir).toHaveBeenCalledTimes(1)
    expect(fs.mkdir).toHaveBeenNthCalledWith(1, '/foo/bar/quux', {
      recursive: true,
    })
    expect(fs.writeFile).toHaveBeenCalledTimes(3)
    expect(fs.writeFile).toHaveBeenNthCalledWith(
      1,
      '/foo/bar/quux/index.txt',
      'quux',
      'utf-8'
    )
    expect(fs.writeFile).toHaveBeenNthCalledWith(
      2,
      '/foo/bar/baz.txt',
      'baz',
      'utf-8'
    )
    expect(fs.writeFile).toHaveBeenNthCalledWith(
      3,
      '/foo/bar/qux.txt',
      'qux',
      'utf-8'
    )
  })
})
