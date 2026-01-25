import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { getClientReferenceManifest, retry } from 'next-test-utils'

function getServerReferenceIdsFromBundle(source: string): string[] {
  // Reference IDs are strings with [0-9a-f] that are at least 32 characters long.
  // We use RegExp to find them in the bundle.
  const referenceIds = source.matchAll(/"([0-9a-f]{32,})"/g) || []
  return [...referenceIds].map(([, id]) => id)
}

describe('app-dir - client-actions-tree-shaking', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const logs: string[] = []

  beforeAll(() => {
    const onLog = (log: string) => {
      logs.push(log.trim())
    }
    next.on('stdout', onLog)
    next.on('stderr', onLog)
  })

  afterEach(async () => {
    logs.length = 0
  })

  /**
   * Parses the client reference manifest for a given route and returns the client chunks
   */
  function getClientChunks(route: string): Array<string> {
    const clientManifest = getClientReferenceManifest(next, route)
    const chunks = new Set<string>()
    if (process.env.IS_TURBOPACK_TEST) {
      // These only exist for turbopack and are encoded as files
      // entryJSFiles is a map of module name to a set of chunks relative to `.next`
      for (const entries of Object.values(clientManifest.entryJSFiles)) {
        for (const chunk of entries) {
          chunks.add(chunk)
        }
      }
      // client mmodules is a mapping from module name to a set of chunks releative to `/_next/`
      // So strip that prefix and add it to the chunks
      for (const clientModule of Object.values(clientManifest.clientModules)) {
        for (const chunk of clientModule.chunks) {
          chunks.add(chunk.replace('/_next/', ''))
        }
      }
    } else {
      // webpack doens't use entryJSFiles, so we need to use clientModules but the format is different.
      // chunks is a sequence of 'chunk-id', chunk-path pairs, so we need to skip the chunk-id
      for (const clientModule of Object.values(clientManifest.clientModules)) {
        for (let i = 1; i < clientModule.chunks.length; i += 2) {
          chunks.add(clientModule.chunks[i])
        }
      }
    }
    return Array.from(chunks)
  }

  it('should not bundle unused server reference id in client bundles', async () => {
    const bundle1Files = getClientChunks('/route-1/page')
    const bundle2Files = getClientChunks('/route-2/page')
    const bundle3Files = getClientChunks('/route-3/page')

    const bundle1Contents = await Promise.all(
      bundle1Files.map((file: string) =>
        next.readFile(join(next.distDir, file))
      )
    )
    const bundle2Contents = await Promise.all(
      bundle2Files.map((file: string) =>
        next.readFile(join(next.distDir, file))
      )
    )
    const bundle3Contents = await Promise.all(
      bundle3Files.map((file: string) =>
        next.readFile(join(next.distDir, file))
      )
    )

    const bundle1Ids = bundle1Contents.flatMap((file: string) =>
      getServerReferenceIdsFromBundle(file)
    )
    const bundle2Ids = bundle2Contents.flatMap((file: string) =>
      getServerReferenceIdsFromBundle(file)
    )
    const bundle3Ids = bundle3Contents.flatMap((file: string) =>
      getServerReferenceIdsFromBundle(file)
    )

    // Bundle 1 and 2 should only have one ID.
    expect(bundle1Ids).toHaveLength(1)
    expect(bundle2Ids).toHaveLength(1)
    expect(bundle1Ids[0]).not.toEqual(bundle2Ids[0])

    // Bundle 3 should have no IDs.
    expect(bundle3Ids).toHaveLength(0)
  })

  // Test the application
  it('should trigger actions correctly', async () => {
    const browser = await next.browser('/route-1')
    await browser.elementById('submit').click()

    await retry(() => {
      expect(logs).toEqual(
        expect.arrayContaining([expect.stringContaining('This is action foo')])
      )
    })

    const browser2 = await next.browser('/route-2')
    await browser2.elementById('submit').click()

    await retry(() => {
      expect(logs).toEqual(
        expect.arrayContaining([expect.stringContaining('This is action bar')])
      )
    })
  })
})
