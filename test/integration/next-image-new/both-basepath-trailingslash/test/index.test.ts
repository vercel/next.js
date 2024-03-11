/* eslint-env jest */

import {
  fetchViaHTTP,
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
    expect.assertions(3)
    const browser = await webdriver(appPort, '/prefix/')
    const img = await browser.elementById('import-img')
    const src = await img.getAttribute('src')
    expect(src).toMatch(
      /\/prefix\/_next\/image\/\?url=%2Fprefix%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.jpg&w=828&q=75/
    )
    const res = await fetchViaHTTP(appPort, src)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
  })
  it('should correctly load image src from string', async () => {
    expect.assertions(3)
    const browser = await webdriver(appPort, '/prefix/')
    const img = await browser.elementById('string-img')
    const src = await img.getAttribute('src')
    expect(src).toBe('/prefix/_next/image/?url=%2Fprefix%2Ftest.jpg&w=640&q=75')
    const res = await fetchViaHTTP(appPort, src)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
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
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
