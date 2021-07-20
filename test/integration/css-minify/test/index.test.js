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

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
let appPort
let app

function runTests() {
  it('should minify correctly by removing whitespace', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    const href = $('link').attr('href')
    expect(href).toMatch(/\/_next\/static\/css\/.*\.css/)
    const css = await renderViaHTTP(appPort, href)
    expect(css).toBe(
      '.a{--var-1:0;--var-2:0;--var-1:-50%;--var-2:-50%}.b{--var-1:0;--var-2:0;--var-2:-50%}'
    )
  })
}

describe('css-minify', () => {
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
