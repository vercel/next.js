/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import {
  stopApp,
  startApp,
  nextBuild,
  nextServer,
  renderViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 60)
const appDir = join(__dirname, '../')
let appPort
let server
let app

describe('Custom Document Fragment Styles', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true,
    })

    server = await startApp(app)
    appPort = server.address().port
  })
  afterAll(() => stopApp(server))

  it('correctly adds styles from fragment styles key', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)

    const styles = $('style').text()
    expect(styles).toMatch(/background:(.*|)hotpink/)
    expect(styles).toMatch(/font-size:(.*|)16\.4px/)
  })
})
