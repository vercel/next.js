/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')
let appPort
let app
let browser

function runTests() {
  it('should render an image tag', async () => {
    await waitFor(1000)
    expect(await browser.hasElementByCssSelector('img')).toBeTruthy()
  })
  it('should pass through src from component attributes', async () => {
    expect(await browser.elementByCss('img').getAttribute('src')).toBe(
      'https://example.com/myaccount/foo.jpg'
    )
  })
}

describe('Image Component Tests', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))
  describe('SSR Image Component Tests', () => {
    beforeAll(async () => {
      browser = await webdriver(appPort, '/')
    })
    afterAll(async () => {
      browser = null
    })
    runTests()
  })
  describe('Client-side Image Component Tests', () => {
    beforeAll(async () => {
      browser = await webdriver(appPort, '/')
      await browser.waitForElementByCss('#clientlink').click()
    })
    afterAll(async () => {
      browser = null
    })
    runTests()
  })
})
