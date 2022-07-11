import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'
import path from 'path'
import { promises as fs } from 'fs'

describe('Edge Compiler can import blob assets', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, './app')),
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('allows to fetch text blobs', async () => {
    const html = await renderViaHTTP(next.url, '/api/edge', {
      handler: 'text-file',
    })
    expect(html).toContain('Hello, from text-file.txt!')
  })

  it('allows to fetch image blobs', async () => {
    const response = await fetchViaHTTP(next.url, '/api/edge', {
      handler: 'image-file',
    })
    const buffer: Buffer = await response.buffer()
    const image = await fs.readFile(
      path.join(__dirname, './app/src/vercel.png')
    )
    expect(buffer.equals(image)).toBeTrue()
  })
})
