import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { getClientReferenceManifest } from 'next-test-utils'

// @force-gate !deploy
describe('client-reference-chunking', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  // In Turbopack development, each page has its own HMR chunk list, which is appended to the
  // chunks of every client reference so that a client-side navigation subscribes to it. It is
  // listed under `rootMainFilesTree[route]` in the page's build manifest, in addition to the
  // shared `rootMainFiles`.
  function getPageHmrChunks(route: string): Set<string> {
    if (!isNextDev || !isTurbopack) {
      return new Set()
    }
    const buildManifestPath = path.join(
      next.testDir,
      next.distDir,
      `server/app${route}/build-manifest.json`
    )
    const { rootMainFiles, rootMainFilesTree } = JSON.parse(
      fs.readFileSync(buildManifestPath, 'utf8')
    ) as {
      rootMainFiles: string[]
      rootMainFilesTree?: Record<string, string[]>
    }
    const sharedFiles = new Set(rootMainFiles)
    return new Set(
      (rootMainFilesTree?.[route] ?? [])
        .filter((file) => !sharedFiles.has(file))
        .map((file) => `/_next/${file}`)
    )
  }

  // Returns the client modules of the route, without the route's own HMR chunk list.
  function getClientModules(route: string) {
    const { clientModules } = getClientReferenceManifest(next, route)
    const hmrChunks = getPageHmrChunks(route)
    return Object.fromEntries(
      Object.entries(clientModules).map(([key, entry]) => {
        // A merged chunk is a `[url, componentPaths, componentSizes]` tuple.
        const chunks: ReadonlyArray<string | readonly [string, ...unknown[]]> =
          entry.chunks
        return [
          key,
          {
            ...entry,
            chunks: chunks.filter(
              (chunk) =>
                !hmrChunks.has(typeof chunk === 'string' ? chunk : chunk[0])
            ),
          },
        ]
      })
    )
  }

  it('should use the same chunks for client references across routes', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/issue"]').click()

    expect(await browser.elementByCss('body').text()).toContain(
      'Welcome to the Issue Page'
    )

    // These two routes have the same client component references, so these should be exactly the
    // same (especially the `chunks` field). Only the routes' own HMR chunk lists may differ.
    expect(getClientModules('/page')).toEqual(getClientModules('/issue/page'))
  })
})
