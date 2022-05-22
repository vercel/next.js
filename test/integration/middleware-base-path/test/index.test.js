/* eslint-env jest */

jest.setTimeout(1000 * 60 * 2)

import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'

const context = {}
context.appDir = join(__dirname, '../')

describe('Middleware base tests', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort)
    })
    afterAll(() => killApp(context.app))
    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(context.appDir)
      context.appPort = await findPort()
      context.app = await nextStart(context.appDir, context.appPort)
    })
    afterAll(() => killApp(context.app))
    runTests()
    runPreflightTests()
  })
})

function runTests() {
  it('should execute from absolute paths', async () => {
    const browser = await webdriver(context.appPort, '/redirect-with-basepath')
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(
        '/root/redirect-with-basepath'
      )
    } finally {
      await browser.close()
    }

    const res = await fetchViaHTTP(
      context.appPort,
      '/root/redirect-with-basepath'
    )
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('.title').text()).toBe('About Page')
  })
}

function runPreflightTests() {
  it('should redirect via preflight middleware request', async () => {
    const browser = await webdriver(context.appPort, '/root')

    try {
      await browser.waitForCondition(
        'next.router && Object.keys(next.router.sde).length == 4'
      )
      const redirect = await browser.eval(
        `next.router.sde["http://localhost:${context.appPort}/root/redirect-me-to-about"].redirect`
      )
      expect(redirect).toBe('/root/about')
    } finally {
      await browser.close()
    }
  })
}
