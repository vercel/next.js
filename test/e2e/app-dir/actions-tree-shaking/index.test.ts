import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import { promises as fs } from 'fs'
import { join } from 'path'

const appDir = __dirname

function getServerReferenceIdsFromBundle(source: string): string[] {
  // Reference IDs are strings with [0-9a-f] that are at least 32 characters long.
  // We use RegExp to find them in the bundle.
  const referenceIds = source.matchAll(/"([0-9a-f]{32,})"/g) || []
  return [...referenceIds].map(([, id]) => id)
}

describe('app-dir tree-shaking', () => {
  const { next, isNextStart } = nextTestSetup({
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
    if (!isNextStart) return

    const route1Files = await fs.readdir(
      join(appDir, '.next/static/chunks/app/route-1')
    )
    const route2Files = await fs.readdir(
      join(appDir, '.next/static/chunks/app/route-2')
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

    const bundle1Ids = getServerReferenceIdsFromBundle(route1Bundle.toString())
    const bundle2Ids = getServerReferenceIdsFromBundle(route2Bundle.toString())

    // Each should only have one ID.
    expect(bundle1Ids).toHaveLength(1)
    expect(bundle2Ids).toHaveLength(1)
    expect(bundle1Ids[0]).not.toEqual(bundle2Ids[0])
  })

  // Test the application
  it('should trigger actions correctly', async () => {
    const browser = await next.browser('/route-1')
    await browser.elementById('submit').click()
    expect(
      await check(
        () =>
          logs.some((log) => log.includes('This is action foo'))
            ? 'success'
            : '',
        'success'
      )
    ).toBeTrue()

    const browser2 = await next.browser('/route-2')
    await browser2.elementById('submit').click()
    expect(
      await check(
        () =>
          logs.some((log) => log.includes('This is action bar'))
            ? 'success'
            : '',
        'success'
      )
    ).toBeTrue()
  })
})
