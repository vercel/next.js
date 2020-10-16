/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import { killApp, findPort, nextBuild, nextStart } from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let server
jest.setTimeout(1000 * 60 * 2)

describe('Analytics relayer (disabled)', () => {
  let stdout
  beforeAll(async () => {
    appPort = await findPort()
    ;({ stdout } = await nextBuild(appDir, [], {
      stdout: true,
    }))
    server = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(server))

  it('Does not relay any data', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.waitForElementByCss('h1')
    const h1Text = await browser.elementByCss('h1').text()
    const firstContentfulPaint = parseFloat(
      await browser.eval('localStorage.getItem("FCP")')
    )

    expect(h1Text).toMatch(/Foo!/)

    expect(firstContentfulPaint).not.toBeNaN()
    expect(firstContentfulPaint).toBeGreaterThan(0)

    const beacons = (await browser.eval('window.__BEACONS')).map(([, value]) =>
      Object.fromEntries(new URLSearchParams(value))
    )

    expect(beacons.length).toBe(0)

    expect(stdout).not.toMatch('Next.js Analytics')

    await browser.close()
  })
})
