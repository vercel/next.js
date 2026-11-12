import fs from 'fs'
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

  async function build(generateComponentChunks: boolean, distDir: string) {
    await next.patchFile(
      'next.config.js',
      `module.exports = ${JSON.stringify({
        distDir,
        experimental: {
          turbopackChunking: { generateComponentChunks },
        },
      })}`
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
  }

  describe.each([
    { generateComponentChunks: false, distDir: '.next' },
    { generateComponentChunks: true, distDir: '.next' },
    { generateComponentChunks: false, distDir: 'custom-dist' },
  ])(
    'with generateComponentChunks: $generateComponentChunks, distDir: $distDir',
    ({ generateComponentChunks, distDir }) => {
      const STATS_PATH = `${distDir}/diagnostics/route-bundle-stats.json`

      beforeAll(async () => {
        await build(generateComponentChunks, distDir)
      })

      async function readStats(): Promise<RouteBundleStat[]> {
        return JSON.parse(await next.readFile(STATS_PATH))
      }

      // Evaluates an App Router page's client reference manifest the same way
      // the server loads it.
      async function readClientReferenceManifest(
        page: string
      ): Promise<ClientReferenceManifest> {
        const context: {
          globalThis?: unknown
          __RSC_MANIFEST?: Record<string, ClientReferenceManifest>
        } = {}
        context.globalThis = context
        vm.runInNewContext(
          await next.readFile(
            `${distDir}/server/app${page}_client-reference-manifest.js`
          ),
          context
        )
        return context.__RSC_MANIFEST![page]
      }

      // Computes a route's stats from the emitted manifests and chunk files.
      // App Router routes load the entry JS files of all their pages.
      async function expectedStat(
        route: string,
        router: 'app' | 'pages',
        appPages: string[] = [`${route === '/' ? '' : route}/page`]
      ): Promise<RouteBundleStat> {
        const buildManifest = JSON.parse(
          await next.readFile(`${distDir}/build-manifest.json`)
        )
        const files =
          router === 'app'
            ? [
                ...(
                  await Promise.all(
                    appPages.map(async (page) =>
                      Object.values(
                        (await readClientReferenceManifest(page)).entryJSFiles
                      ).flat()
                    )
                  )
                ).flat(),
                ...buildManifest.rootMainFiles,
              ]
            : [
                ...(buildManifest.pages[route] ?? []),
                ...buildManifest.pages['/_app'],
              ]
        const chunks = [
          ...new Set<string>(files.filter((f) => f.endsWith('.js'))),
        ]
        let bytes = 0
        for (const chunk of chunks) {
          bytes += (await next.readFileBuffer(path.join(distDir, chunk))).length
        }
        return {
          route,
          firstLoadUncompressedJsBytes: bytes,
          // Paths use forward slashes on all platforms.
          firstLoadChunkPaths: chunks.map((f) => `${distDir}/${f}`),
        }
      }

      it('writes the route bundle stats after build', async () => {
        const stats = await readStats()

        // App Router route handlers (`/handler`) are not reported.
        expect(stats.map((e) => e.route).sort()).toEqual([
          '/',
          '/_not-found',
          '/api/hello',
          '/blog',
          '/parallel',
        ])

        for (const entry of stats) {
          expect(entry.firstLoadUncompressedJsBytes).toBeGreaterThan(0)
          expect(entry.firstLoadChunkPaths.length).toBeGreaterThan(0)
          for (const chunkPath of entry.firstLoadChunkPaths) {
            // Paths use forward slashes on all platforms.
            expect(chunkPath.startsWith(`${distDir}/static/`)).toBe(true)
            expect(chunkPath).not.toContain('\\')
          }
        }

        // Entries are sorted descending by firstLoadUncompressedJsBytes, then
        // by route.
        for (let i = 1; i < stats.length; i++) {
          const a = stats[i - 1]
          const b = stats[i]
          if (
            a.firstLoadUncompressedJsBytes === b.firstLoadUncompressedJsBytes
          ) {
            expect(a.route < b.route).toBe(true)
          } else {
            expect(a.firstLoadUncompressedJsBytes).toBeGreaterThan(
              b.firstLoadUncompressedJsBytes
            )
          }
        }
      })

      it('reports the entry JS files and root main files of App Router routes', async () => {
        const stats = await readStats()
        for (const route of ['/blog', '/_not-found']) {
          expect(stats.find((e) => e.route === route)).toEqual(
            await expectedStat(route, 'app')
          )
        }

        const { entryJSFiles, clientModules } =
          await readClientReferenceManifest('/blog/page')
        const rootMainFiles: string[] = JSON.parse(
          await next.readFile(`${distDir}/build-manifest.json`)
        ).rootMainFiles
        const blog = stats.find((e) => e.route === '/blog')!
        if (!generateComponentChunks) {
          // The page's client component chunk is a page entry JS file.
          expect(blog.firstLoadChunkPaths.length).toBeGreaterThan(
            rootMainFiles.length
          )
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
      })

      it('reports the entry JS files of all pages of an App Router route', async () => {
        // The parallel slot's page is a separate page of the `/parallel` route.
        const appPaths = Object.keys(
          JSON.parse(
            await next.readFile(`${distDir}/server/app-paths-manifest.json`)
          )
        )
        const pages = ['/parallel/page', '/parallel/@slot/page']
        for (const page of pages) {
          expect(appPaths).toContain(page)
        }

        const stats = await readStats()
        expect(stats.find((e) => e.route === '/parallel')).toEqual(
          await expectedStat('/parallel', 'app', pages)
        )
      })

      it('reports the page and _app chunks of Pages Router routes', async () => {
        const stats = await readStats()
        for (const route of ['/', '/api/hello']) {
          expect(stats.find((e) => e.route === route)).toEqual(
            await expectedStat(route, 'pages')
          )
        }
      })

      it('only writes the stats file', async () => {
        const files = await fs.promises.readdir(
          path.join(next.testDir, distDir, 'diagnostics')
        )
        expect(files).toContain('route-bundle-stats.json')
        const serverFiles = await fs.promises.readdir(
          path.join(next.testDir, distDir, 'server'),
          { recursive: true }
        )
        expect(
          serverFiles.filter((f) => f.endsWith('_entry-js-files.json'))
        ).toEqual([])
      })
    }
  )
})
