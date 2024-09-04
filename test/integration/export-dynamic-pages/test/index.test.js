/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  startCleanStaticServer,
  stopApp,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const outdir = join(appDir, 'out')

describe('Export Dynamic Pages', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      let server
      let port
      beforeAll(async () => {
        await nextBuild(appDir)

        server = await startCleanStaticServer(outdir)
        port = server.address().port
      })

      afterAll(async () => {
        await stopApp(server)
      })

      it('should of exported with correct asPath', async () => {
        const html = await renderViaHTTP(port, '/regression/jeff-is-cool')
        const $ = cheerio.load(html)
        expect($('#asPath').text()).toBe('/regression/jeff-is-cool')
      })

      it('should hydrate with correct asPath', async () => {
        expect.assertions(1)
        const browser = await webdriver(port, '/regression/jeff-is-cool')
        try {
          expect(await browser.eval(`window.__AS_PATHS`)).toEqual([
            '/regression/jeff-is-cool',
          ])
        } finally {
          await browser.close()
        }
      })
    }
  )
})
