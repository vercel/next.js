import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import type { NextAdapter } from 'next'
import { listClientChunks } from 'next-test-utils'

// Immutable static files are only supported with Turbopack anyway
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'output: standalone with an adapter - immutable assets',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      disableAutoSkewProtection: true,
    })

    it('emits immutable assets and reports their hashes', async () => {
      const files = await listClientChunks(join(next.testDir, next.distDir))
      expect(files).toContainEqual(expect.stringContaining('static/immutable/'))
      expect(files).not.toContainEqual(
        expect.stringMatching(/^static\/chunks\//)
      )

      // The standalone output is still written.
      expect(
        await next.hasFile(join(next.distDir, 'standalone', 'server.js'))
      ).toBe(true)

      const hashes = await next.readJSON(
        join(next.distDir, 'immutable-static-hashes.json')
      )
      const staticFiles: Parameters<
        NextAdapter['onBuildComplete']
      >[0]['outputs']['staticFiles'] = await next.readJSON(
        'build-complete.json'
      )

      let immutableFileCount = 0
      for (const output of staticFiles) {
        const id = output.id
          .replace(/^[/\\]?_next[/\\]/, '')
          .replaceAll('\\', '/')
        expect(output.immutableHash).toBe(hashes[id])
        if (output.immutableHash) {
          immutableFileCount++
        }
      }
      expect(immutableFileCount).toBeGreaterThan(0)
    })

    it('serves the page with immutable asset URLs and no deployment query', async () => {
      const html = await next.render('/')
      expect(html).toContain('/_next/static/immutable/')
      expect(html).not.toContain('?dpl=test-deployment-id')

      const browser = await next.browser('/')
      expect(await browser.elementByCss('p').text()).toBe('hello world')
    })
  }
)
