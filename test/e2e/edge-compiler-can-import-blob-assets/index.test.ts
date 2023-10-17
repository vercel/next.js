import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'
import path from 'path'
import { promises as fs } from 'fs'
import { readJson } from 'fs-extra'

// TODO: `node-fetch` hangs on some of these tests in Node.js.
// Re-enable when `node-fetch` is dropped.
// See: https://github.com/vercel/next.js/pull/55112
describe.skip('Edge Compiler can import asset assets', () => {
  let next: NextInstance

  // TODO: remove after this is supported for deploy
  if ((global as any).isNextDeploy) {
    it('should skip for deploy for now', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, './app')),
    })
  })
  afterAll(() => next.destroy())

  it('allows to fetch a remote URL', async () => {
    const response = await fetchViaHTTP(next.url, '/api/edge', {
      handler: 'remote-full',
    })
    expect(await response.text()).toContain('Example Domain')
  })

  it('allows to fetch a remote URL with a path and basename', async () => {
    const response = await fetchViaHTTP(next.url, '/api/edge', {
      handler: 'remote-with-base',
    })
    expect(await response.text()).toContain('Example Domain')
  })

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

  it('allows to assets from node_modules', async () => {
    const response = await fetchViaHTTP(next.url, '/api/edge', {
      handler: 'from-node-module',
    })
    const json = await response.json()
    expect(json).toEqual({
      'i am': 'a node dependency',
    })
  })

  it('extracts all the assets from the bundle', async () => {
    const manifestPath = path.join(
      next.testDir,
      '.next/server/middleware-manifest.json'
    )
    const manifest = await readJson(manifestPath)
    const orderedAssets = manifest.functions['/api/edge'].assets.sort(
      (a, z) => {
        return String(a.name).localeCompare(z.name)
      }
    )

    expect(orderedAssets).toMatchObject([
      {
        name: expect.stringMatching(/^text-file\.[0-9a-f]{16}\.txt$/),
        filePath: expect.stringMatching(
          /^server\/edge-chunks\/asset_text-file/
        ),
      },
      {
        name: expect.stringMatching(/^vercel\.[0-9a-f]{16}\.png$/),
        filePath: expect.stringMatching(/^server\/edge-chunks\/asset_vercel/),
      },
      {
        name: expect.stringMatching(/^world\.[0-9a-f]{16}\.json/),
        filePath: expect.stringMatching(/^server\/edge-chunks\/asset_world/),
      },
    ])
  })
})
