import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { getClientReferenceManifest } from 'next-test-utils'

type RouteBundleStat = {
  route: string
  firstLoadUncompressedJsBytes: number
  firstLoadChunkPaths: string[]
}

// Route bundle stats are only emitted by Turbopack. The tests read the build
// output, which deployments don't have locally.
// @force-gate turbopack
// @force-gate !deploy
describe('route-bundle-stats', () => {
  describe.each([
    { generateComponentChunks: false, distDir: '.next' },
    { generateComponentChunks: true, distDir: '.next' },
    { generateComponentChunks: false, distDir: 'custom-dist' },
  ])(
    'with generateComponentChunks: $generateComponentChunks, distDir: $distDir',
    ({ generateComponentChunks, distDir }) => {
      const { next } = nextTestSetup({
        files: __dirname,
        nextConfig: {
          distDir,
          experimental: {
            turbopackChunking: { generateComponentChunks },
          },
        },
      })

      const STATS_PATH = `${distDir}/diagnostics/route-bundle-stats.json`

      async function readStats(): Promise<RouteBundleStat[]> {
        return JSON.parse(await next.readFile(STATS_PATH))
      }

      function entryJSFiles(page: string): string[] {
        const { entryJSFiles } = getClientReferenceManifest(next, page)
        expect(entryJSFiles).toBeDefined()
        return Object.values(entryJSFiles!).flat()
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
                ...appPages.flatMap(entryJSFiles),
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

        // App Router route handlers (`/handler`) and Pages Router API routes
        // (`/api/hello`) ship no client JS and are not reported.
        expect(stats.map((e) => e.route).sort()).toEqual([
          '/',
          '/_not-found',
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
          const { clientModules } = getClientReferenceManifest(
            next,
            '/blog/page'
          )
          const componentChunks = Object.values(clientModules)
            .flatMap((m) => m.chunks as ReadonlyArray<string | string[]>)
            .map((c) => (typeof c === 'string' ? c : c[0]))
            .map((c) => c.replace(/^\/_next\//, ''))
          expect(componentChunks.length).toBeGreaterThan(0)
          const blogEntryJSFiles = entryJSFiles('/blog/page')
          for (const chunk of componentChunks) {
            expect(blogEntryJSFiles).not.toContain(chunk)
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
        expect(stats.find((e) => e.route === '/')).toEqual(
          await expectedStat('/', 'pages')
        )
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
