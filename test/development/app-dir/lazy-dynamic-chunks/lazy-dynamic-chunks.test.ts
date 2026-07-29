import { promises as fs } from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Markers live inside module bodies rather than in filenames, so these assertions survive chunk
// hashing and any change to how chunks are named or split.
const EAGER_MARKER = 'eager-chunk-marker-4c1d'
const LAZY_MARKER = 'lazy-chunk-marker-9f3a'
const LAZY_CSS_MARKER = 'lazy-css-marker-7b2e'
const INTERACTIVE_MARKER = 'interactive-chunk-marker-2e8b'
const INTERACTIVE_CSS_MARKER = 'interactive-css-marker-5d1c'

// Lazy dynamic-import chunk groups are Turbopack-only, and only wired up in the dev client
// chunking context, behind `experimental.turbopackLazyDynamicImports` in this fixture's config.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'lazy-dynamic-chunks',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      patchFileDelay: 500,
    })

    /** Every file the client emit pass has written so far. */
    async function clientAssets(): Promise<string[]> {
      const root = path.join(next.testDir, next.distDir, 'static')
      const found: string[] = []

      async function walk(dir: string) {
        let entries
        try {
          entries = await fs.readdir(dir, { withFileTypes: true })
        } catch {
          // The directory does not exist until the first client asset is emitted.
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

    /** Client assets whose contents contain `marker`. */
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

    /** Every file the react-loadable manifest lists for `route`, across all dynamic imports. */
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

    it('does not emit the dynamic import chunk while compiling the route', async () => {
      // Drive the compile over HTTP rather than a browser so nothing can speculatively request
      // the lazy chunk and materialize it behind the assertion.
      const res = await next.fetch('/')
      expect(res.status).toBe(200)

      // `emit_assets` skips lazy assets, so "was it built eagerly?" is just "is it on disk?".
      // Anchor on the eager marker first: once it lands, this route's client emit pass has run,
      // which is what makes the absence checks below meaningful rather than merely early.
      await retry(async () => {
        expect(await assetsContaining(EAGER_MARKER)).not.toHaveLength(0)
      })

      expect(await assetsContaining(LAZY_MARKER)).toHaveLength(0)
      expect(await assetsContaining(LAZY_CSS_MARKER)).toHaveLength(0)
    })

    it('resolves the dynamic import to a boundary chunk rather than its target group', async () => {
      // The chunks being absent from disk only shows they were not *written*. The loadable manifest
      // is built from whatever the async loader resolved to, so it is where an eagerly resolved
      // target chunk group would show up. The target imports a CSS module, so its group contains a
      // CSS chunk; the boundary that stands in for it is JS only.
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

      /** URLs the page has requested so far. */
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

      // The CSS sibling has to come from the same materialized snapshot as the JS chunk. Reading
      // the computed style proves it was served and applied, not merely produced somewhere.
      expect(
        await browser.eval(
          `getComputedStyle(document.querySelector('#target')).color`
        )
      ).toBe('rgb(0, 128, 0)')

      // Materializing a boundary applies the emit effects it declared, so the chunks land on disk
      // like any other output asset and the normal static path can serve them from here on.
      await retry(async () => {
        expect(await assetsContaining(INTERACTIVE_MARKER)).not.toHaveLength(0)
        expect(await assetsContaining(INTERACTIVE_CSS_MARKER)).not.toHaveLength(
          0
        )
      })

      // New chunks rather than rewrites of the route's existing ones, which also catches siblings
      // being dropped from the materialized snapshot.
      const newAssets = (await clientAssets()).filter(
        (asset) => !emittedBefore.has(asset)
      )
      expect(newAssets).not.toHaveLength(0)

      // Also assert over the wire, since the first request is served from the content map before
      // anything reaches disk. Re-requesting covers the second-hit path.
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
      // This is the path the dev overlay takes to map a stack frame, and it reaches the boundary
      // through the content map, which hands back the lazy wrapper rather than the chunk it wraps.
      // The wrapper has to forward `GenerateSourceMap` for the lookup to resolve; when it does not,
      // the lookup raises and this endpoint answers 500.
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
      // HMR is driven by chunk lists, and the page's own list cannot name the chunks behind a
      // boundary — knowing them is the work being deferred. They get a list of their own,
      // generated behind the same boundary, and the dev server has to attribute the materialized
      // paths to the entry that owns the boundary; the subscription is dropped for a path it
      // cannot trace back to an entrypoint. Without either, this edit never arrives.
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

        // Applied as an update rather than a reload, so a component that is already mounted keeps
        // its state.
        expect(await browser.eval('performance.timeOrigin')).toEqual(timeOrigin)
      } finally {
        await next.patchFile(targetPath, originalContent)
      }
    })

    it('keeps the lazy chunk of an untouched route unmaterialized', async () => {
      // `/` is compiled but never interacted with, so materializing `/interactive` in the
      // previous test must not have dragged this route's boundary along with it.
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
