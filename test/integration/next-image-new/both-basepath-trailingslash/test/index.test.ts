/* eslint-env jest */

import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')

let appPort
let app

const runTests = () => {
  it('should correctly load image src from import', async () => {
    expect.assertions(1)
    const browser = await webdriver(appPort, '/prefix/')
    const img = await browser.elementById('import-img')
    const src = await img.getAttribute('src')
    expect(src).toBe(
      '/prefix/_next/image/?url=%2Fprefix%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=75'
    )
  })
  it('should correctly load image src from string', async () => {
    expect.assertions(1)
    const browser = await webdriver(appPort, '/prefix/')
    const img = await browser.elementById('string-img')
    const src = await img.getAttribute('src')
    expect(src).toBe('/prefix/_next/image/?url=%2Fprefix%2Ftest.jpg&w=640&q=75')
  })
}

describe('Image Component basePath + trailingSlash Tests', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
