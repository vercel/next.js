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
  it('Should use a custom resolver for image URL', async () => {
    expect(await browser.elementById('basic-image').getAttribute('src')).toBe(
      'https://customresolver.com/foo.jpg?w~~1024,q~~60'
    )
  })
  it('should add a srcset based on the custom resolver', async () => {
    expect(
      await browser.elementById('basic-image').getAttribute('srcset')
    ).toBe(
      'https://customresolver.com/foo.jpg?w~~480,q~~60 1x, https://customresolver.com/foo.jpg?w~~1024,q~~60 2x'
    )
  })
  it('Should use a different default resolver for image URL as specified', async () => {
    expect(
      await browser.elementById('different-default-image').getAttribute('src')
    ).toBe(
      'https://globalresolver.com/myaccount/f_auto,c_limit,w_1024,q_60/foo.jpg'
    )
  })
  it('should support the unoptimized attribute', async () => {
    expect(
      await browser.elementById('unoptimized-image').getAttribute('src')
    ).toBe('https://arbitraryurl.com/foo.jpg')
  })
}

describe('Custom Resolver Tests', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))
  describe('SSR Custom Loader Tests', () => {
    beforeAll(async () => {
      browser = await webdriver(appPort, '/')
    })
    afterAll(async () => {
      browser = null
    })
    runTests()
  })
  describe('Client-side Custom Loader Tests', () => {
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
