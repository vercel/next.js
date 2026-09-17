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
  let targetFlightPath: string
  let targetFlight: string
  const requests: string[] = []

  beforeAll(async () => {
    await next.build()

    targetFlightPath = join(
      next.testDir,
      'out/target/index.current-deployment-id.txt'
    )
    targetFlight = readFileSync(targetFlightPath, 'utf8')
    const currentNavigationId = '"b":"current-deployment-id"'
    if (!targetFlight.includes(currentNavigationId)) {
      throw new Error(
        'Could not find the current deployment ID in target RSC data'
      )
    }

    port = await findPort()
    server = createExportServer(join(next.testDir, 'out'), requests)
    server.listen(port)
  })

  beforeEach(() => {
    requests.length = 0
    writeFileSync(targetFlightPath, targetFlight)
  })

  afterAll(() => {
    server?.close()
  })

  it('uses the current navigation RSC payload without an MPA navigation', async () => {
    const browser = await next.browser('/', { baseUrl: port })

    await browser.elementById('persistent-input').type('draft value')
    await browser.elementById('target-link').click()
    await browser.waitForElementByCss('#target-page')

    expect(await browser.elementById('persistent-input').getValue()).toBe(
      'draft value'
    )
    expect(requests).toContain('/target/index.current-deployment-id.txt')
    expect(
      requests.filter(
        (pathname) => pathname === '/target' || pathname === '/target/'
      )
    ).toEqual([])
  })

  it('preserves the trailing slash during an MPA fallback', async () => {
    writeFileSync(
      targetFlightPath,
      targetFlight.replace(
        '"b":"current-deployment-id"',
        '"b":"foreign-deployment-id"'
      )
    )

    const browser = await next.browser('/', { baseUrl: port })

    await browser.elementById('persistent-input').type('draft value')
    await browser.elementById('target-link').click()
    await browser.waitForElementByCss('#target-page')

    await retry(async () => {
      expect(new URL(await browser.url()).pathname).toBe('/target/')
    })

    expect(await browser.elementById('persistent-input').getValue()).toBe('')
    expect(requests).toContain('/target/index.current-deployment-id.txt')
    expect(
      requests.filter(
        (pathname) => pathname === '/target' || pathname === '/target/'
      )
    ).toEqual(['/target/'])
  })
})
