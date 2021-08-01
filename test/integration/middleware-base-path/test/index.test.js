/* eslint-env jest */

import { fetchViaHTTP, findPort, killApp, launchApp } from 'next-test-utils'
import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'

const context = {}
context.appDir = join(__dirname, '../')

describe('Edge middleware tests', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.app = await launchApp(context.appDir, context.appPort)
  })
  afterAll(() => killApp(context.app))
  runTests()
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
