/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import { validateAMP } from 'amp-test-utils'
import {
  nextBuild,
  renderViaHTTP,
  nextStart,
  findPort,
  killApp,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let app

describe('AMP Custom Styles', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir, [])
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it("amp-custom style elements shouldn't be duplicated", async () => {
      const html = await renderViaHTTP(appPort, '/', { amp: 1 })
      await validateAMP(html)
      const $ = cheerio.load(html)
      expect($('style[amp-custom]').length).toBe(1)
    })

    it('adds styles from fragment or style element in AMP mode correctly', async () => {
      const html = await renderViaHTTP(appPort, '/', { amp: 1 })
      await validateAMP(html)
      const $ = cheerio.load(html)
      const styles = $('style[amp-custom]').text()
      expect(styles).toMatch(/background:(.*|)#000/)
      expect(styles).toMatch(/color:(.*|)#fff/)
      expect(styles).toMatch(/border-radius:(.*|)16px/)
      expect(styles).toMatch(/font-size:(.*|)16\.4px/)
    })
  })
})
