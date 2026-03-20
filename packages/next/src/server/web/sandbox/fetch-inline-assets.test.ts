import { mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { fetchInlineAsset } from './fetch-inline-assets'

describe('fetchInlineAsset', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fetch-inline-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('should return undefined for non-blob URLs', async () => {
    const result = await fetchInlineAsset({
      input: 'https://example.com',
      distDir: tmpDir,
      assets: [],
      context: { Response, ReadableStream },
    })
    expect(result).toBeUndefined()
  })

  it('should return undefined when asset not found', async () => {
    const result = await fetchInlineAsset({
      input: 'blob:missing-asset',
      distDir: tmpDir,
      assets: [],
      context: { Response, ReadableStream },
    })
    expect(result).toBeUndefined()
  })

  it('should return undefined when file does not exist', async () => {
    const result = await fetchInlineAsset({
      input: 'blob:test-asset',
      distDir: tmpDir,
      assets: [{ name: 'test-asset', filePath: 'nonexistent.js' }],
      context: { Response, ReadableStream },
    })
    expect(result).toBeUndefined()
  })

  it('should destroy read stream if Response constructor throws', async () => {
    const testFile = join(tmpDir, 'test.js')
    await writeFile(testFile, 'console.log("hello")')

    const ThrowingResponse = function () {
      throw new Error('Response constructor failed')
    } as any

    await expect(
      fetchInlineAsset({
        input: 'blob:test.js',
        distDir: tmpDir,
        assets: [{ name: 'test.js', filePath: 'test.js' }],
        context: { Response: ThrowingResponse, ReadableStream },
      })
    ).rejects.toThrow('Response constructor failed')

    // The read stream should have been destroyed by the catch block,
    // preventing a file descriptor leak.
  })
})
