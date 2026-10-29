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
// available when chunking the following ones, so a module shared by
// `loading.tsx` and `page.tsx` is emitted into the chunks of `loading.tsx`
// only, and the page's chunk list includes those chunks.
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
    function clientReferenceChunks(file: string): string[] {
      const manifest = getClientReferenceManifest(next, '/segment/page')
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
  }
)
