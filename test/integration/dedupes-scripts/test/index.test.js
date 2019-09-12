/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import cheerio from 'cheerio'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  renderViaHTTP
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = join(__dirname, '../')
let appPort
let app

describe('De-dedupes scripts in _document', () => {
  beforeAll(async () => {
    appPort = await findPort()
    await nextBuild(appDir)
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('Does not have duplicate script references', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    let foundDuplicate = false
    const srcs = new Set()

    for (const script of $('script').toArray()) {
      const { src } = script.attribs
      if (!src || !src.startsWith('/_next/static')) continue
      if (srcs.has(src)) {
        console.error(`Found duplicate script ${src}`)
        foundDuplicate = true
      }
      srcs.add(src)
    }
    expect(foundDuplicate).toBe(false)
  })
})
