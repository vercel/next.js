import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import FileSystemCache from 'next/dist/server/lib/incremental-cache/file-system-cache'
import { nodeFs } from 'next/dist/server/lib/node-fs-methods'

const cacheDir = fileURLToPath(new URL('./cache', import.meta.url))

describe('FileSystemCache', () => {
  it('set image route', async () => {
    const fsCache = new FileSystemCache({
      _appDir: true,
      _requestHeaders: {},
      flushToDisk: true,
      fs: nodeFs,
      serverDistDir: cacheDir,
      revalidatedTags: [],
    })

    const binary = await fs.readFile(
      fileURLToPath(new URL('./images/icon.png', import.meta.url))
    )

    await fsCache.set('icon.png', {
      body: binary,
      headers: {
        'Content-Type': 'image/png',
      },
      status: 200,
      kind: 'ROUTE',
    })

    expect((await fsCache.get('icon.png')).value).toEqual({
      body: binary,
      headers: {
        'Content-Type': 'image/png',
      },
      status: 200,
      kind: 'ROUTE',
    })
  })
})
