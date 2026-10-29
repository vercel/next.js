import { readFile } from 'fs/promises'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { getClientReferenceManifest } from 'next-test-utils'
import { ERROR_MARKER } from './app/segment/error-marker'
import { NOT_FOUND_MARKER } from './app/segment/not-found-marker'
import { SHARED_MARKER } from './app/segment/shared-module'

// The client references of each server component (layout, loading, page, ...)
// are chunked as a separate chunk group. Modules of the server components that
// are rendered whenever the following ones are (parent layouts, and the
// `loading.tsx` and `template.tsx` of a segment) are treated as already
// available when chunking the following ones, so the code of a module shared by
// `loading.tsx` and `page.tsx` is emitted into the chunks of `loading.tsx`
// only, and the page's chunk list includes those chunks. Styles of
// `loading.tsx` are not made available that way.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'loading-chunk-availability',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      // Inspects the build output on disk, which isn't reachable on a
      // deployment.
      skipDeployment: true,
    })

    if (skipped) return

    type ManifestChunk = string | [string, ...unknown[]]

    /** The chunk URLs of the client references whose module path contains `file`. */
    function clientReferenceChunks(
      file: string,
      page = '/segment/page'
    ): string[] {
      const manifest = getClientReferenceManifest(next, page)
      const chunks = new Set<string>()
      for (const [key, node] of Object.entries(manifest.clientModules)) {
        if (!key.includes(file)) continue
        for (const chunk of node.chunks as ManifestChunk[]) {
          chunks.add(Array.isArray(chunk) ? chunk[0] : chunk)
        }
      }
      // Guard against the assertions below passing on an empty list, e.g. if
      // the manifest keys change shape.
      expect(chunks.size).toBeGreaterThan(0)
      return [...chunks]
    }

    function readChunk(url: string): Promise<string> {
      const pathname = new URL(url, 'http://n').pathname
      return readFile(
        join(next.testDir, next.distDir, pathname.replace(/^\/_next\//, '')),
        'utf8'
      )
    }

    async function chunksContaining(urls: string[], marker: string) {
      const matching: string[] = []
      for (const url of urls) {
        if ((await readChunk(url)).includes(marker)) {
          matching.push(url)
        }
      }
      return matching
    }

    it('renders the page', async () => {
      const $ = await next.render$('/segment')
      expect($('#content').text()).toBe(`page:${SHARED_MARKER}`)
    })

    it('loads the module shared by loading.tsx and page.tsx from one script', async () => {
      const $ = await next.render$('/segment')
      const scripts = $('script[src]')
        .toArray()
        .map((script) => $(script).attr('src')!)
      expect(scripts.length).toBeGreaterThan(0)

      const matching: string[] = []
      for (const src of scripts) {
        const res = await next.fetch(src)
        expect(res.status).toBe(200)
        if ((await res.text()).includes(SHARED_MARKER)) {
          matching.push(src)
        }
      }

      expect(matching).toHaveLength(1)
    })

    it("includes loading.tsx's chunks in the page's chunk list", () => {
      const loadingChunks = clientReferenceChunks('app/segment/skeleton.tsx')
      const pageChunks = clientReferenceChunks('app/segment/content.tsx')

      expect(pageChunks).toEqual(expect.arrayContaining(loadingChunks))
    })

    it('does not make the page load not-found.tsx or error.tsx code', async () => {
      const pageChunks = clientReferenceChunks('app/segment/content.tsx')

      // The markers do exist in the build, so their absence from the page's
      // chunks below is meaningful.
      expect(
        await chunksContaining(
          clientReferenceChunks('app/segment/not-found-content.tsx'),
          NOT_FOUND_MARKER
        )
      ).not.toHaveLength(0)
      expect(
        await chunksContaining(
          clientReferenceChunks('app/segment/error.tsx'),
          ERROR_MARKER
        )
      ).not.toHaveLength(0)

      expect(await chunksContaining(pageChunks, SHARED_MARKER)).toHaveLength(1)
      expect(await chunksContaining(pageChunks, NOT_FOUND_MARKER)).toEqual([])
      expect(await chunksContaining(pageChunks, ERROR_MARKER)).toEqual([])
    })

    // The styles of `loading.tsx` are rendered inside the Suspense fallback, so
    // they only apply while the fallback is shown.
    describe('CSS', () => {
      const LOADING_ONLY_CSS_MARKER = 'loading-only-marker-3f9a'

      /** The CSS files the manifest of `page` lists for the server component `entry`. */
      function entryCssFiles(page: string, entry: string): string[] {
        const manifest = getClientReferenceManifest(next, page)
        const files = Object.entries(manifest.entryCSSFiles).find(([key]) =>
          key.endsWith(entry)
        )?.[1] as { path: string }[] | undefined
        expect(files).toBeDefined()
        return files!.map(({ path }) => `/_next/${path}`)
      }

      async function filesContaining(
        urls: string[],
        marker: string
      ): Promise<string[]> {
        const matching: string[] = []
        for (const url of urls) {
          const res = await next.fetch(url)
          expect(res.status).toBe(200)
          if ((await res.text()).includes(marker)) {
            matching.push(url)
          }
        }
        return matching
      }

      it("includes loading.tsx's chunks in the page's chunk list when loading.tsx has styles", () => {
        const loadingChunks = clientReferenceChunks(
          'app/css/css-skeleton.tsx',
          '/css/page'
        )
        const pageChunks = clientReferenceChunks(
          'app/css/css-content.tsx',
          '/css/page'
        )

        expect(pageChunks).toEqual(expect.arrayContaining(loadingChunks))
      })

      it("does not list loading.tsx's CSS for the page", async () => {
        // The marker does exist in the build, so its absence from the page's
        // CSS files below is meaningful.
        expect(
          await filesContaining(
            entryCssFiles('/css/page', 'app/css/loading'),
            LOADING_ONLY_CSS_MARKER
          )
        ).toHaveLength(1)

        expect(
          await filesContaining(
            entryCssFiles('/css/page', 'app/css/page'),
            LOADING_ONLY_CSS_MARKER
          )
        ).toEqual([])
      })

      it("does not link or apply loading.tsx's CSS when the fallback is not shown", async () => {
        const $ = await next.render$('/loading-css')
        expect($('#loading-css-content').text()).toBe('page')
        expect($('#loading-css-skeleton')).toHaveLength(0)
        const hrefs = $('link[rel="stylesheet"]')
          .toArray()
          .map((link) => $(link).attr('href')!)
        expect(await filesContaining(hrefs, LOADING_ONLY_CSS_MARKER)).toEqual(
          []
        )

        const browser = await next.browser('/loading-css')
        await browser.waitForElementByCss('#loading-css-content')
        expect(
          await browser.eval(`getComputedStyle(document.body).backgroundColor`)
        ).toBe('rgba(0, 0, 0, 0)')
      })

      it('applies a CSS module that loading.tsx and page.tsx both import', async () => {
        const browser = await next.browser('/css')
        expect(
          await browser.eval(
            `getComputedStyle(document.querySelector('#css-content')).color`
          )
        ).toBe('rgb(7, 8, 9)')
      })

      it('applies a CSS module that loading.tsx imports and the page imports dynamically', async () => {
        const browser = await next.browser('/lazy-css')
        await browser.waitForElementByCss('#lazy-panel')
        expect(
          await browser.eval(
            `getComputedStyle(document.querySelector('#lazy-panel')).color`
          )
        ).toBe('rgb(10, 20, 30)')
      })
    })
  }
)
