/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let app

describe('Noscript Tests', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))
    describe('Noscript page source tests', () => {
      it('should use local API for noscript img#basic-image src attribute', async () => {
        const html = await renderViaHTTP(appPort, '/')
        const $ = cheerio.load(html)

        expect($('noscript > img#basic-image').attr('src')).toMatch(
          /^\/_next\/image/
        )
      })
      it('should use loader url for noscript img#image-with-loader src attribute', async () => {
        const html = await renderViaHTTP(appPort, '/')
        const $ = cheerio.load(html)

        expect($('noscript > img#image-with-loader').attr('src')).toMatch(
          /^https:\/\/customresolver.com/
        )
      })
    })
  })
})
