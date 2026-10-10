import type { Server } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findPort, retry } from 'next-test-utils'
import { isNextStart, nextTestSetup } from 'e2e-utils'
import { createExportServer } from './server.mjs'

describe('static-export-skew-trailing-slash', () => {
  if (!isNextStart) {
    test('build test should not run during dev test run', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    disableAutoSkewProtection: true,
  })

  let port: number
  let server: Server
  const requests: string[] = []

  beforeAll(async () => {
    await next.build()

    const targetFlightPath = join(next.testDir, 'out/target/index.txt')
    const targetFlight = readFileSync(targetFlightPath, 'utf8')
    const currentBuildId = '"b":"current-build-id"'
    if (!targetFlight.includes(currentBuildId)) {
      throw new Error('Could not find the current build ID in target RSC data')
    }
    writeFileSync(
      targetFlightPath,
      targetFlight.replace(currentBuildId, '"b":"foreign-build-id"')
    )

    port = await findPort()
    server = createExportServer(join(next.testDir, 'out'), requests)
    server.listen(port)
  })

  afterAll(() => {
    server?.close()
  })

  it('preserves the trailing slash during an MPA fallback', async () => {
    const browser = await next.browser('/', { baseUrl: port })

    await browser.elementById('target-link').click()
    await browser.waitForElementByCss('#target-page')

    await retry(async () => {
      expect(new URL(await browser.url()).pathname).toBe('/target/')
    })

    expect(requests).toContain('/target/index.txt')
    expect(
      requests.filter(
        (pathname) => pathname === '/target' || pathname === '/target/'
      )
    ).toEqual(['/target/'])
  })
})
