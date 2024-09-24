import { promises as fs } from 'fs'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

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

  it('should not bundle unused server reference id in client bundles', async () => {
    const appDir = next.testDir
    const route1Files = await fs.readdir(
      join(appDir, '.next/static/chunks/app/route-1')
    )
    const route2Files = await fs.readdir(
      join(appDir, '.next/static/chunks/app/route-2')
    )
    const route3Files = await fs.readdir(
      join(appDir, '.next/static/chunks/app/route-3')
    )

    const route1Bundle = await fs.readFile(
      join(
        appDir,
        '.next/static/chunks/app/route-1',
        route1Files.find((file) => file.endsWith('.js'))
      )
    )
    const route2Bundle = await fs.readFile(
      join(
        appDir,
        '.next/static/chunks/app/route-2',
        route2Files.find((file) => file.endsWith('.js'))
      )
    )
    const route3Bundle = await fs.readFile(
      join(
        appDir,
        '.next/static/chunks/app/route-3',
        route3Files.find((file) => file.endsWith('.js'))
      )
    )

    const bundle1Ids = getServerReferenceIdsFromBundle(route1Bundle.toString())
    const bundle2Ids = getServerReferenceIdsFromBundle(route2Bundle.toString())
    const bundle3Ids = getServerReferenceIdsFromBundle(route3Bundle.toString())

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
