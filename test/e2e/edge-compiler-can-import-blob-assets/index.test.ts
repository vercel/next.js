import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'
import path from 'path'
import { promises as fs } from 'fs'
import { readJson } from 'fs-extra'

describe('Edge Compiler can import asset assets', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, './app')),
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('allows to fetch text assets', async () => {
    const html = await renderViaHTTP(next.url, '/api/edge', {
      handler: 'text-file',
    })
    expect(html).toContain('Hello, from text-file.txt!')
  })

  it('allows to fetch image assets', async () => {
    const response = await fetchViaHTTP(next.url, '/api/edge', {
      handler: 'image-file',
    })
    const buffer: Buffer = await response.buffer()
    const image = await fs.readFile(
      path.join(__dirname, './app/src/vercel.png')
    )
    expect(buffer.equals(image)).toBeTrue()
  })

  it('extracts all the assets from the bundle', async () => {
    const manifestPath = path.join(
      next.testDir,
      '.next/server/middleware-manifest.json'
    )
    const manifest = await readJson(manifestPath)
    expect(manifest.functions['/api/edge'].assets).toMatchObject([
      {
        name: expect.stringMatching(/^text-file\.[0-9a-f]{8}\.txt$/),
        filePath: expect.stringMatching(
          /^server\/edge-chunks\/asset_text-file/
        ),
      },
      {
        name: expect.stringMatching(/^vercel\.[0-9a-f]{8}\.png$/),
        filePath: expect.stringMatching(/^server\/edge-chunks\/asset_vercel/),
      },
    ])
  })
})
