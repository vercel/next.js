import { promises as fs } from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'lazy-dynamic-imports',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      patchFileDelay: 500,
    })

    async function assetsContaining(marker: string): Promise<string[]> {
      const root = path.join(next.testDir, next.distDir, 'static')
      const matches: string[] = []

      async function walk(dir: string) {
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
          const entryPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            await walk(entryPath)
          } else if (
            // The dev server may rewrite a chunk while we are walking it.
            (await fs.readFile(entryPath, 'utf8').catch(() => '')).includes(
              marker
            )
          ) {
            matches.push(entryPath)
          }
        }
      }

      await walk(root)
      return matches
    }

    it('activates a dynamic import over HTTP and keeps Fast Refresh working', async () => {
      const targetPath = path.join('app', 'target.tsx')
      const originalTarget = await next.readFile(targetPath)

      expect(await next.render('/server-import')).toContain(
        'server-dynamic-import'
      )
      expect(await next.render('/server-next-dynamic')).toContain(
        'server-next-dynamic'
      )
      expect(await next.fetch('/untouched').then((res) => res.status)).toBe(200)

      const browser = await next.browser('/')

      expect(await browser.elementByCss('#eager').text()).toBe(
        'eager-marker-7c2a'
      )
      expect(await assetsContaining('lazy-marker-9a4e')).toHaveLength(0)
      expect(await assetsContaining('color: green')).toHaveLength(0)
      expect(await assetsContaining('untouched-marker-2d8c')).toHaveLength(0)
      // A valid-looking activation path that no lazy proxy owns falls through to the static handler.
      expect(
        await next
          .fetch(
            '/_next/static/chunks/not-a-lazy-chunk-lazy-compilation-0123456789abcdef.js'
          )
          .then((res) => res.status)
      ).toBe(404)

      const initialTimeOrigin = await browser.eval('performance.timeOrigin')
      await browser.elementByCss('#load').click()
      await retry(async () => {
        expect(await browser.elementByCss('#target').text()).toBe(
          'lazy-marker-9a4e'
        )
      })
      expect(
        await browser.eval(
          `getComputedStyle(document.querySelector('#target')).color`
        )
      ).toBe('rgb(0, 128, 0)')
      expect(await assetsContaining('lazy-marker-9a4e')).not.toHaveLength(0)
      expect(await assetsContaining('color: green')).not.toHaveLength(0)
      expect(await assetsContaining('untouched-marker-2d8c')).toHaveLength(0)
      expect(await browser.eval('performance.timeOrigin')).toBe(
        initialTimeOrigin
      )

      await browser.elementByCss('#run-action').click()
      await retry(async () => {
        expect(await browser.elementByCss('#action-result').text()).toBe(
          'lazy-action-result'
        )
      })

      const targetAsset = (await assetsContaining('lazy-marker-9a4e')).find(
        (asset) => asset.endsWith('.js')
      )
      expect(targetAsset).toBeDefined()
      const sourceMapResponse = await next.fetch(
        `/__nextjs_source-map?filename=${encodeURIComponent(targetAsset!)}`
      )
      expect(sourceMapResponse.status).toBe(200)
      expect(await sourceMapResponse.json()).toHaveProperty('version', 3)

      const timeOrigin = await browser.eval('performance.timeOrigin')
      try {
        await next.patchFile(
          targetPath,
          originalTarget.replace('lazy-marker-9a4e', 'updated-marker')
        )
        await retry(async () => {
          expect(await browser.elementByCss('#target').text()).toBe(
            'updated-marker'
          )
        })
        expect(await browser.eval('performance.timeOrigin')).toBe(timeOrigin)
      } finally {
        await next.patchFile(targetPath, originalTarget)
      }
    })
  }
)
