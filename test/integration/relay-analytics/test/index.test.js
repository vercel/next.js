/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import { killApp, findPort, nextBuild, nextStart, check } from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let server
jest.setTimeout(1000 * 60 * 2)

describe('Analytics relayer', () => {
  let stdout
  beforeAll(async () => {
    appPort = await findPort()
    ;({ stdout } = await nextBuild(appDir, [], {
      env: { VERCEL_ANALYTICS_ID: 'test' },
      stdout: true,
    }))
    server = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(server))

  it('Relays the data to user code', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.waitForElementByCss('h1')
    const h1Text = await browser.elementByCss('h1').text()
    const data = parseFloat(
      await browser.eval('localStorage.getItem("Next.js-hydration")')
    )
    const firstByte = parseFloat(
      await browser.eval('localStorage.getItem("TTFB")')
    )
    const firstContentfulPaint = parseFloat(
      await browser.eval('localStorage.getItem("FCP")')
    )
    let largestContentfulPaint = await browser.eval(
      'localStorage.getItem("LCP")'
    )
    let cls = await browser.eval('localStorage.getItem("CLS")')
    expect(h1Text).toMatch(/Foo!/)
    expect(data).not.toBeNaN()
    expect(data).toBeGreaterThan(0)
    expect(firstByte).not.toBeNaN()
    expect(firstByte).toBeGreaterThan(0)
    expect(firstContentfulPaint).not.toBeNaN()
    expect(firstContentfulPaint).toBeGreaterThan(0)
    expect(largestContentfulPaint).toBeNull()
    expect(cls).toBeNull()
    // Create an artificial layout shift
    await browser.eval('document.querySelector("h1").style.display = "none"')
    await browser.refresh()
    await browser.waitForElementByCss('h1')
    largestContentfulPaint = parseFloat(
      await browser.eval('localStorage.getItem("LCP")')
    )
    cls = parseFloat(await browser.eval('localStorage.getItem("CLS")'))
    expect(cls).not.toBeNull()
    expect(largestContentfulPaint).not.toBeNaN()
    expect(largestContentfulPaint).toBeGreaterThan(0)

    await check(async () => {
      const numBeacons = await browser.eval('window.__BEACONS.length')
      return numBeacons === 2
        ? 'success'
        : `invalid beacon count: ${numBeacons}`
    }, 'success')

    const beacons = (await browser.eval('window.__BEACONS')).map(([, value]) =>
      Object.fromEntries(new URLSearchParams(value))
    )

    expect(beacons.length).toBe(2)

    for (const beacon of beacons) {
      expect(beacon.event_name === 'FCP' || beacon.event_name === 'TTFB').toBe(
        true
      )
      expect(beacon.dsn).toBe('test')
      expect(beacon.href.includes('http://')).toBe(true)
      expect(beacon.id.includes('-')).toBe(true)
      expect(beacon.page).toBe('/')
      expect(beacon.speed).toBe('4g')
      expect(isNaN(parseFloat(beacon.value))).toBe(false)
    }

    expect(stdout).toMatch('Next.js Analytics')
    await browser.close()
  })
})
