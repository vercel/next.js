/* eslint-env jest */

import { join } from 'path'
import { killApp, findPort, nextStart, nextBuild } from 'next-test-utils'
import webdriver from 'next-webdriver'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')
let appPort
let app
let browser

function runTests() {
  it('Should include picture tag when formats array is set', async () => {
    expect(
      await browser
        .elementByCss('#basic-image-wrapper picture source')
        .getAttribute('srcset')
    ).toBe(
      '/_next/image?url=%2Ffoo.jpg&w=384&q=60&f=webp 1x, /_next/image?url=%2Ffoo.jpg&w=640&q=60&f=webp 2x'
    )
  })
  it('should set the "type" prop on the source element', async () => {
    expect(
      await browser
        .elementByCss('#basic-image-wrapper picture source')
        .getAttribute('type')
    ).toBe('image/webp')
  })

  it('should include an img tag with default srcset', async () => {
    expect(
      new URL(
        await browser.elementByCss('#basic-image').getAttribute('src')
      ).searchParams.get('f')
    ).toBeFalsy()
  })

  it('should not use a picture tag when "unoptimized" is set', async () => {
    expect(
      await browser.hasElementByCssSelector(
        '#unoptimized-image-wrapper picture source'
      )
    ).toBeFalsy()
  })
}

describe('Picture Tag Tests', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))
  describe('SSR Picture Tag Tests', () => {
    beforeAll(async () => {
      browser = await webdriver(appPort, '/')
    })
    afterAll(async () => {
      browser = null
    })
    runTests()
  })
  describe('Client-side Picture Tag Tests', () => {
    beforeAll(async () => {
      browser = await webdriver(appPort, '/')
      await browser
        .elementByCss('#clientlink')
        .click()
        .waitForElementByCss('#client-side')
    })
    afterAll(async () => {
      browser = null
    })
    runTests()
  })
})
