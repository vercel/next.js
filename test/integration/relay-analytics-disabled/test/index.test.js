/* eslint-env jest */

import fs from 'fs-extra'
import { findPort, killApp, nextBuild, nextStart } from 'next-test-utils'
import webdriver from 'next-webdriver'
import path, { join } from 'path'

const appDir = join(__dirname, '../')
let appPort
let server
jest.setTimeout(1000 * 60 * 2)

let buildManifest

describe('Analytics relayer (disabled)', () => {
  let stdout
  beforeAll(async () => {
    appPort = await findPort()
    ;({ stdout } = await nextBuild(appDir, [], {
      stdout: true,
    }))
    buildManifest = require(path.join(
      appDir,
      '.next/build-manifest.json'
    ), 'utf8')
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

  it('Does not include the code', async () => {
    const pageFiles = [
      ...new Set([
        ...buildManifest.pages['/'].filter((file) => file.endsWith('.js')),
        ...buildManifest.pages['/_app'].filter((file) => file.endsWith('.js')),
      ]),
    ]

    expect(pageFiles.length).toBeGreaterThan(1)

    for (const pageFile of pageFiles) {
      const content = await fs.readFile(
        path.join(appDir, '.next', pageFile),
        'utf8'
      )
      expect(content).not.toMatch('vercel-insights')
    }
  })
})
