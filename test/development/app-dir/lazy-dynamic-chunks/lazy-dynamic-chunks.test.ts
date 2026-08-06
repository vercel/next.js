import { promises as fs } from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const EAGER_MARKER = 'eager-chunk-marker-4c1d'
const LAZY_MARKER = 'lazy-chunk-marker-9f3a'
const LAZY_CSS_MARKER = 'lazy-css-marker-7b2e'
const INTERACTIVE_MARKER = 'interactive-chunk-marker-2e8b'
const INTERACTIVE_CSS_MARKER = 'interactive-css-marker-5d1c'

;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'lazy-dynamic-chunks',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      patchFileDelay: 500,
    })

    async function clientAssets(): Promise<string[]> {
      const root = path.join(next.testDir, next.distDir, 'static')
      const found: string[] = []

      async function walk(dir: string) {
        let entries
        try {
          entries = await fs.readdir(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const entry of entries) {
          const entryPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            await walk(entryPath)
          } else {
            found.push(entryPath)
          }
        }
      }

      await walk(root)
      return found
    }

    async function assetsContaining(marker: string): Promise<string[]> {
      const assets = await clientAssets()
      const matches = await Promise.all(
        assets.map(async (asset) => {
          const contents = await fs.readFile(asset, 'utf8').catch(() => '')
          return contents.includes(marker) ? asset : null
        })
      )
      return matches.filter((asset): asset is string => asset !== null)
    }

    async function loadableManifestFiles(route: string): Promise<string[]> {
      const manifestPath = path.join(
        next.testDir,
        next.distDir,
        'server/app',
        route,
        'react-loadable-manifest.json'
      )
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
      return Object.values(manifest).flatMap(
        (entry: { files: string[] }) => entry.files
      )
    }

    it('keeps server dynamic imports available during the initial render', async () => {
      const res = await next.fetch('/server-import')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('server-dynamic-import')
    })

    it('renders server next/dynamic imports during the initial render', async () => {
      const res = await next.fetch('/server-next-dynamic')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('server-next-dynamic')
    })

    it('does not emit the dynamic import chunk while compiling the route', async () => {
      const res = await next.fetch('/')
      expect(res.status).toBe(200)

      await retry(async () => {
        expect(await assetsContaining(EAGER_MARKER)).not.toHaveLength(0)
      })

      expect(await assetsContaining(LAZY_MARKER)).toHaveLength(0)
      expect(await assetsContaining(LAZY_CSS_MARKER)).toHaveLength(0)
    })

    it('resolves the dynamic import to a boundary chunk rather than its target group', async () => {
      expect(await next.fetch('/').then((res) => res.status)).toBe(200)

      let files: string[]
      await retry(async () => {
        files = await loadableManifestFiles('page')
        expect(files).not.toHaveLength(0)
      })

      expect(files.filter((file) => file.endsWith('.css'))).toHaveLength(0)
      expect(files.every((file) => file.endsWith('.js'))).toBe(true)
    })

    it('emits and serves the dynamic import chunk when the browser requests it', async () => {
      const browser = await next.browser('/interactive')

      await retry(async () => {
        expect(await browser.elementByCss('#eager').text()).toBe(EAGER_MARKER)
      })

      const requestedUrls = async (): Promise<string[]> =>
        (await browser.eval(
          `performance.getEntriesByType('resource').map((entry) => entry.name)`
        )) as string[]

      const requestedBefore = new Set(await requestedUrls())
      const emittedBefore = new Set(await clientAssets())

      await browser.elementByCss('#render-target').click()

      await retry(async () => {
        expect(await browser.elementByCss('#target').text()).toBe(
          INTERACTIVE_MARKER
        )
      })

      expect(
        await browser.eval(
          `getComputedStyle(document.querySelector('#target')).color`
        )
      ).toBe('rgb(0, 128, 0)')

      await retry(async () => {
        expect(await assetsContaining(INTERACTIVE_MARKER)).not.toHaveLength(0)
        expect(await assetsContaining(INTERACTIVE_CSS_MARKER)).not.toHaveLength(
          0
        )
      })

      const newAssets = (await clientAssets()).filter(
        (asset) => !emittedBefore.has(asset)
      )
      expect(newAssets).not.toHaveLength(0)

      const newChunkUrls = (await requestedUrls())
        .filter((url) => !requestedBefore.has(url))
        .filter((url) => url.includes('/_next/static/chunks/'))
      expect(newChunkUrls).not.toHaveLength(0)

      const bodies = await Promise.all(
        newChunkUrls.map(async (url) => {
          const { pathname, search } = new URL(url)
          const res = await next.fetch(pathname + search)
          expect(res.status).toBe(200)
          return { url, body: await res.text() }
        })
      )

      expect(
        bodies.filter(({ body }) => body.includes(INTERACTIVE_MARKER))
      ).not.toHaveLength(0)
      expect(
        bodies.filter(({ body }) => body.includes(INTERACTIVE_CSS_MARKER))
      ).not.toHaveLength(0)
    })

    it('resolves a source map for the boundary chunk', async () => {
      const boundaryChunk = (await loadableManifestFiles('interactive/page'))[0]
      expect(boundaryChunk).toMatch(/\.js$/)

      const filename = path.join(next.testDir, next.distDir, boundaryChunk)
      const res = await next.fetch(
        `/__nextjs_source-map?filename=${encodeURIComponent(filename)}`
      )
      expect(res.status).toBe(200)
      expect(await res.json()).toHaveProperty('version', 3)
    })

    it('applies an edit to a mounted dynamic component over HMR', async () => {
      const targetPath = path.join('app', 'interactive', 'target.tsx')
      const originalContent = await next.readFile(targetPath)
      try {
        const browser = await next.browser('/interactive')
        await browser.elementByCss('#render-target').click()

        await retry(async () => {
          expect(await browser.elementByCss('#target').text()).toBe(
            INTERACTIVE_MARKER
          )
        })

        const timeOrigin = await browser.eval('performance.timeOrigin')

        await next.patchFile(
          targetPath,
          originalContent.replace(INTERACTIVE_MARKER, 'updated-marker')
        )

        await retry(async () => {
          expect(await browser.elementByCss('#target').text()).toBe(
            'updated-marker'
          )
        }, 10000)

        expect(await browser.eval('performance.timeOrigin')).toEqual(timeOrigin)
      } finally {
        await next.patchFile(targetPath, originalContent)
      }
    })

    it('keeps the lazy chunk of an untouched route unmaterialized', async () => {
      const res = await next.fetch('/')
      expect(res.status).toBe(200)

      await retry(async () => {
        expect(await assetsContaining(EAGER_MARKER)).not.toHaveLength(0)
      })

      expect(await assetsContaining(LAZY_MARKER)).toHaveLength(0)
      expect(await assetsContaining(LAZY_CSS_MARKER)).toHaveLength(0)
    })
  }
)
