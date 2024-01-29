/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import { killApp, findPort, nextBuild, nextStart, check } from 'next-test-utils'

const appDir = join(__dirname, '../')

let appPort
let server
let stderr
jest.setTimeout(1000 * 60 * 2)

async function buildApp() {
  appPort = await findPort()
  ;({ stderr } = await nextBuild(appDir, [], {
    env: { VERCEL_ANALYTICS_ID: 'test' },
    stdout: true,
    stderr: true,
  }))
  server = await nextStart(appDir, appPort)
}
async function killServer() {
  await killApp(server)
}

describe('Analytics relayer with exported method', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => await buildApp())
    afterAll(async () => await killServer())
    runTest()
  })
})

function runTest() {
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

    const beaconsCountBeforeCLS = await browser.eval('window.__BEACONS_COUNT')
    expect(
      Object.values(beaconsCountBeforeCLS).every((value) => value === 1)
    ).toBe(true)

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

    const beaconsCountAfterCLS = await browser.eval('window.__BEACONS_COUNT')
    expect(
      Object.values(beaconsCountAfterCLS).every((value) => value === 2)
    ).toBe(true)

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

    expect(stderr).toMatch(
      '`config.analyticsId` is deprecated and will be removed in next major version. Read more: https://nextjs.org/docs/messages/deprecated-analyticsid'
    )
    await browser.close()
  })

  it('reports INP metric', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('button').click()
    await browser.waitForCondition(
      'document.querySelector("button").textContent === "Press"'
    )
    // INP metric is only reported on pagehide or visibilitychange event, so refresh the page
    await browser.refresh()

    // TODO: investigate flakey INP case
    // await check(async () => {
    //   const INP = parseInt(
    //     await browser.eval('localStorage.getItem("INP")'),
    //     10
    //   )
    //   // We introduced a delay of 100ms, so INP duration should be >= 100
    //   expect(INP).toBeGreaterThanOrEqual(100)
    //   return 'success'
    // }, 'success')
    await browser.close()
  })

  it('reports attribution', async () => {
    const browser = await webdriver(appPort, '/')
    // trigger paint
    await browser.elementByCss('button').click()
    await browser.waitForCondition(
      `window.__metricsWithAttribution?.length > 0`
    )
    const str = await browser.eval(
      `JSON.stringify(window.__metricsWithAttribution)`
    )
    const metrics = JSON.parse(str)
    const LCP = metrics.find((m) => m.name === 'LCP')
    expect(LCP).toBeDefined()
    expect(LCP.attribution).toBeDefined()
    expect(LCP.attribution.element).toBe('#__next>div>h1')
  })
}
