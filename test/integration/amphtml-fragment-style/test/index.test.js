/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import { validateAMP } from 'amp-test-utils'
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

describe('AMP Fragment Styles', () => {
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

  it('adds styles from fragment in AMP mode correctly', async () => {
    const html = await renderViaHTTP(appPort, '/', { amp: 1 })
    await validateAMP(html)
    const $ = cheerio.load(html)
    const styles = $('style[amp-custom]').text()
    expect(styles).toMatch(/background:(.*|)#ff69b4/)
    expect(styles).toMatch(/font-size:(.*|)16\.4px/)
  })
})
