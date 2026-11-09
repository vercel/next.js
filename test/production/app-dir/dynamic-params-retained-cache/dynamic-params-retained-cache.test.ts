import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deserialize } from 'node:v8'

describe('dynamicParams: false with a cache retained across builds', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  it('rejects a removed build path even when its old cache entry still exists', async () => {
    const original = await next.readFile('slugs.json')
    const cacheFile = join(
      next.testDir,
      'external-cache',
      encodeURIComponent('/products/removed')
    )

    try {
      await next.start()
      expect((await next.fetch('/products/removed')).status).toBe(200)
      const cached = await next.fetch('/products/removed')
      expect(cached.status).toBe(200)
      expect(cached.headers.get('x-nextjs-cache')).toBe('HIT')
      expect(load(await cached.text())('#slug').text()).toBe('removed')

      // Keep the real entry written by Next, outside the build output directory.
      const previousEntry = await readFile(cacheFile)
      expect(deserialize(previousEntry).value.html).toContain('removed')
      await next.stop()
      await next.patchFile('slugs.json', JSON.stringify(['known']))
      await next.start()

      const manifest = await next.readJSON('.next/prerender-manifest.json')
      expect(manifest.routes['/products/known']).toBeDefined()
      expect(manifest.routes['/products/removed']).toBeUndefined()
      expect(await readFile(cacheFile)).toEqual(previousEntry)

      const outputStart = next.cliOutput.length
      for (const headers of [{}, { RSC: '1' }]) {
        const response = await next.fetch('/products/removed', { headers })
        expect(response.status).toBe(404)
        await response.text()
      }
      const output = next.cliOutput.slice(outputStart)
      expect(output).not.toContain('cache lookup /products/removed')
      expect(output).not.toContain('product render removed')
      expect(await readFile(cacheFile)).toEqual(previousEntry)
      expect((await next.fetch('/products/known')).status).toBe(200)
    } finally {
      await next.stop()
      await next.patchFile('slugs.json', original)
    }
  })
})
