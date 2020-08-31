/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'
import cheerio from 'cheerio'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')
let appPort
let app

describe('Loading scripts with defer', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))
  it('should not contain any preloads', async () => {
    const html = await renderViaHTTP(appPort, '/index')
    expect(html).not.toContain('preload')
  })
  it('should have defer on all script tags', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    let missing = false

    for (const script of $('script').toArray()) {
      // application/json doesn't need defer
      if (
        script.attribs.type === 'application/json' ||
        script.attribs.src.includes('polyfills')
      ) {
        continue
      }

      if (script.attribs.async === '' || script.attribs.defer !== '') {
        missing = true
      }
    }
    expect(missing).toBe(false)
  })
})
