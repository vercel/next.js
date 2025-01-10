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

function runTests() {
  it('should minify correctly by removing whitespace', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    const href = $('link').attr('href')
    const css = await renderViaHTTP(appPort, href)
    if (process.env.TURBOPACK) {
      expect(css).toMatchInlineSnapshot(`
        "/* [project]/test/integration/css-minify/styles/global.css [client] (css) */
        .a{--var-1:0;--var-2:0;--var-1:-50%;--var-2:-50%}.b{--var-1:0;--var-2:0;--var-2:-50%}

        /*# sourceMappingURL=test_integration_css-minify_styles_global_411632.css.map*/
        "
      `)
    } else {
      expect(css).toMatchInlineSnapshot(
        `".a{--var-1:0;--var-2:0;--var-1:-50%;--var-2:-50%}.b{--var-1:0;--var-2:0;--var-2:-50%}"`
      )
    }
  })
}

describe('css-minify', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })
      runTests()
    }
  )
})
