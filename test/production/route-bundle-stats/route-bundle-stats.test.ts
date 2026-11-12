import path from 'path'
import vm from 'vm'
import { nextTestSetup } from 'e2e-utils'

type RouteBundleStat = {
  route: string
  firstLoadUncompressedJsBytes: number
  firstLoadChunkPaths: string[]
}

type ClientReferenceManifest = {
  clientModules: Record<string, { chunks: (string | [string, ...unknown[]])[] }>
  entryJSFiles: Record<string, string[]>
}

// Route bundle stats are only emitted by Turbopack.
// @force-gate turbopack
describe('route-bundle-stats', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (isNextDeploy) {
    it('should skip', () => {})
    return
  }

  const STATS_PATH = '.next/diagnostics/route-bundle-stats.json'

  async function build(generateComponentChunks: boolean) {
    await next.patchFile(
      'next.config.js',
      `module.exports = ${JSON.stringify({
        experimental: {
          turbopackChunking: { generateComponentChunks },
        },
      })}`
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
  }

  async function readStats(): Promise<RouteBundleStat[]> {
    return JSON.parse(await next.readFile(STATS_PATH))
  }

  // Evaluates the client reference manifest the same way the server loads it.
  async function readClientReferenceManifest(): Promise<ClientReferenceManifest> {
    const context: {
      globalThis?: unknown
      __RSC_MANIFEST?: Record<string, ClientReferenceManifest>
    } = {}
    context.globalThis = context
    vm.runInNewContext(
      await next.readFile(
        '.next/server/app/blog/page_client-reference-manifest.js'
      ),
      context
    )
    return context.__RSC_MANIFEST!['/blog/page']
  }

  describe.each([false, true])(
    'with generateComponentChunks: %s',
    (generateComponentChunks) => {
      beforeAll(async () => {
        await build(generateComponentChunks)
      })

      it('writes .next/diagnostics/route-bundle-stats.json after build', async () => {
        const stats = await readStats()

        expect(Array.isArray(stats)).toBe(true)
        expect(stats.length).toBeGreaterThan(0)

        for (const entry of stats) {
          expect(typeof entry.route).toBe('string')
          expect(entry.route).toMatch(/^\//)
          expect(typeof entry.firstLoadUncompressedJsBytes).toBe('number')
          expect(entry.firstLoadUncompressedJsBytes).toBeGreaterThan(0)
          expect(Array.isArray(entry.firstLoadChunkPaths)).toBe(true)
          expect(entry.firstLoadChunkPaths.length).toBeGreaterThan(0)

          for (const chunkPath of entry.firstLoadChunkPaths) {
            // Paths use forward slashes on all platforms.
            expect(chunkPath).toMatch(/^\.next\//)
            expect(chunkPath).not.toContain('\\')
          }
        }

        // Entries are sorted descending by firstLoadUncompressedJsBytes.
        for (let i = 1; i < stats.length; i++) {
          expect(
            stats[i - 1].firstLoadUncompressedJsBytes
          ).toBeGreaterThanOrEqual(stats[i].firstLoadUncompressedJsBytes)
        }
      })

      it('includes both Pages Router and App Router routes', async () => {
        const routes = (await readStats()).map((e) => e.route)

        expect(routes).toContain('/')
        expect(routes).toContain('/blog')
      })

      it('matches the entry JS files of the client reference manifest', async () => {
        const { entryJSFiles, clientModules } =
          await readClientReferenceManifest()

        // The file route bundle stats are computed from has the same contents
        // as the manifest's `entryJSFiles`, including keys and order.
        expect(
          JSON.parse(
            await next.readFile(
              '.next/server/app/blog/page_entry-js-files.json'
            )
          )
        ).toEqual(entryJSFiles)

        const blog = (await readStats()).find((e) => e.route === '/blog')!
        const { rootMainFiles } = JSON.parse(
          await next.readFile('.next/build-manifest.json')
        )
        const expected: string[] = [
          ...new Set<string>(
            [...Object.values(entryJSFiles).flat(), ...rootMainFiles].filter(
              (f: string) => f.endsWith('.js')
            )
          ),
        ]

        if (!generateComponentChunks) {
          // The page's client component chunk is a page entry JS file.
          expect(expected.length).toBeGreaterThan(rootMainFiles.length)
        } else {
          // Component chunks are only listed in `clientModules`.
          const componentChunks = Object.values(clientModules)
            .flatMap((m) => m.chunks)
            .map((c) => (typeof c === 'string' ? c : c[0]))
            .map((c) => c.replace(/^\/_next\//, ''))
          expect(componentChunks.length).toBeGreaterThan(0)
          for (const chunk of componentChunks) {
            expect(Object.values(entryJSFiles).flat()).not.toContain(chunk)
          }
        }
        expect(blog.firstLoadChunkPaths).toEqual(
          expected.map((f) => `.next/${f}`)
        )

        let expectedBytes = 0
        for (const f of expected) {
          expectedBytes += (await next.readFileBuffer(path.join('.next', f)))
            .length
        }
        expect(blog.firstLoadUncompressedJsBytes).toBe(expectedBytes)
      })

      it('does not trace the entry JS files manifest into the server output', async () => {
        const trace = JSON.parse(
          await next.readFile('.next/server/app/blog/page.js.nft.json')
        )
        expect(
          trace.files.filter((f: string) => f.includes('entry-js-files'))
        ).toEqual([])
      })
    }
  )
})
