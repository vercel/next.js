import { promises as fs } from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { getRedboxSource, retry, waitForRedbox } from 'next-test-utils'
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
      expect(await browser.elementByCss('#eager-shared').text()).toBe(
        'shared-dependency-marker-b31f'
      )
      const initialChunkPaths: string[] = await browser.eval(`
        [...new Set(performance.getEntriesByType('resource')
          .map((entry) => new URL(entry.name).pathname)
          .filter((pathname) => pathname.endsWith('.js')))]
      `)
      const initialChunkContents = await Promise.all(
        initialChunkPaths.map((chunkPath) =>
          next.fetch(chunkPath).then((res) => res.text())
        )
      )
      expect(
        initialChunkContents.some((content) =>
          content.includes('shared-dependency-marker-b31f')
        )
      ).toBe(true)

      await browser.elementByCss('#load-overlap').click()
      await retry(async () => {
        expect(await browser.elementByCss('#overlap-result').text()).toBe(
          'shared-dependency-marker-b31f'
        )
      })
      const chunksAfterOverlap: string[] = await browser.eval(`
        [...new Set(performance.getEntriesByType('resource')
          .map((entry) => new URL(entry.name).pathname)
          .filter((pathname) => pathname.endsWith('.js')))]
      `)
      const overlapChunkPaths = chunksAfterOverlap.filter(
        (chunkPath) => !initialChunkPaths.includes(chunkPath)
      )
      expect(overlapChunkPaths).not.toHaveLength(0)
      const overlapChunkContents = await Promise.all(
        overlapChunkPaths.map((chunkPath) =>
          next.fetch(chunkPath).then((res) => res.text())
        )
      )
      expect(
        overlapChunkContents.some((content) =>
          content.includes('shared-dependency-marker-b31f')
        )
      ).toBe(false)

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
      expect(await browser.elementByCss('#lazy-shared').text()).toBe(
        'shared-dependency-marker-b31f'
      )
      const loadedChunkPaths: string[] = await browser.eval(`
        [...new Set(performance.getEntriesByType('resource')
          .map((entry) => new URL(entry.name).pathname)
          .filter((pathname) => pathname.endsWith('.js')))]
      `)
      const lazyChunkPaths = loadedChunkPaths.filter(
        (chunkPath) => !chunksAfterOverlap.includes(chunkPath)
      )
      expect(lazyChunkPaths).not.toHaveLength(0)
      const lazyChunkContents = await Promise.all(
        lazyChunkPaths.map((chunkPath) =>
          next.fetch(chunkPath).then((res) => res.text())
        )
      )
      expect(
        lazyChunkContents.some((content) =>
          content.includes('lazy-marker-9a4e')
        )
      ).toBe(true)
      expect(
        lazyChunkContents.some((content) =>
          content.includes('shared-dependency-marker-b31f')
        )
      ).toBe(false)
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

    it('preserves client and server references behind a server dynamic import', async () => {
      const browser = await next.browser('/server-graph')

      expect(
        await browser.hasElementByCssSelector('#server-graph-marker')
      ).toBe(false)
      await browser.elementByCss('#reveal-server-graph').click()
      await retry(async () => {
        expect(await browser.elementByCss('#server-graph-marker').text()).toBe(
          'server-graph-marker'
        )
      })

      await browser.elementByCss('#hydrate-client').click()
      await retry(async () => {
        expect(await browser.elementByCss('#hydration-result').text()).toBe(
          'hydrated'
        )
      })

      await browser.elementByCss('#run-hidden-action').click()
      await retry(async () => {
        expect(await browser.elementByCss('#hidden-action-result').text()).toBe(
          'hidden-action-result'
        )
      })
    })

    it('does not parse a dynamic import target before activation', async () => {
      const targetPath = path.join(
        'app',
        'parse-error',
        'parse-error-target.ts'
      )
      const demoPath = path.join('app', 'parse-error', 'parse-error-demo.tsx')
      const originalTarget = await next.readFile(targetPath)
      const originalDemo = await next.readFile(demoPath)

      try {
        await next.patchFile(
          targetPath,
          `export const parseError = 'parse-error-proves-target-was-analyzed'
export const invalid = ;`
        )
        const browser = await next.browser('/parse-error')

        expect(await browser.elementByCss('#parse-error-idle').text()).toBe(
          'not parsed'
        )

        await next.patchFile(
          demoPath,
          originalDemo.replace('not parsed', 'still not parsed')
        )
        await retry(async () => {
          expect(await browser.elementByCss('#parse-error-idle').text()).toBe(
            'still not parsed'
          )
        })
        expect(
          await browser.eval(`
            Boolean(document.querySelector('nextjs-portal')?.shadowRoot
              ?.querySelector('[data-nextjs-dialog]'))
          `)
        ).toBe(false)

        await browser.elementByCss('#load-parse-error').click()
        await waitForRedbox(browser)
        expect(await getRedboxSource(browser)).toContain(
          'parse-error-proves-target-was-analyzed'
        )
      } finally {
        await next.patchFile(targetPath, originalTarget)
        await next.patchFile(demoPath, originalDemo)
      }
    })

    it('activates a pattern import without colliding with its target', async () => {
      const browser = await next.browser('/pattern')
      await browser.elementByCss('#load-pattern').click()
      await retry(async () => {
        expect(await browser.elementByCss('#load-pattern').text()).toBe(
          'pattern a'
        )
      })

      await browser.eval(`location.hash = 'b'`)
      await browser.elementByCss('#load-pattern').click()
      await retry(async () => {
        expect(await browser.elementByCss('#load-pattern').text()).toBe(
          'pattern b'
        )
      })
    })

    it('gives repeated imports distinct proxies', async () => {
      const browser = await next.browser('/duplicate')
      const getActivationKeys = async (): Promise<string[]> =>
        browser.eval(`
          [...new Set(performance.getEntriesByType('resource')
            .map((entry) => entry.name.match(/lazy-compilation-([0-9a-f]{16})/)?.[1])
            .filter(Boolean))]
        `)
      const initialManifests = await getActivationKeys()

      await browser.elementByCss('#load-first').click()
      await retry(async () => {
        expect(await browser.elementByCss('#load-first').text()).toBe(
          'duplicate target'
        )
      })
      expect(await browser.elementByCss('#load-second').text()).toBe(
        'second idle'
      )
      const manifestsAfterFirst = await getActivationKeys()
      expect(
        manifestsAfterFirst.filter(
          (pathname) => !initialManifests.includes(pathname)
        )
      ).toHaveLength(1)

      await browser.elementByCss('#load-second').click()
      await retry(async () => {
        expect(await browser.elementByCss('#load-second').text()).toBe(
          'duplicate target'
        )
      })
      const manifestsAfterSecond = await getActivationKeys()
      expect(
        manifestsAfterSecond.filter(
          (pathname) => !manifestsAfterFirst.includes(pathname)
        )
      ).toHaveLength(1)
    })
  }
)
