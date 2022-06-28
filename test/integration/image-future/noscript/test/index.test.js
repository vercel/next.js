/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import {
  findPort,
  killApp,
  launchApp,
  nextStart,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let app

function runTests() {
  it('should include noscript for placeholder=blur but not others', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)

    expect($('noscript > img#basic-image').attr('src')).toBeUndefined()
    expect($('noscript > img#image-with-loader').attr('src')).toBeUndefined()
    expect($('noscript > img#image-with-blur').attr('src')).toMatch('blur.jpg')
  })
}

describe('Future Image Component Noscript Tests', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    runTests()
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    runTests()
  })
})
