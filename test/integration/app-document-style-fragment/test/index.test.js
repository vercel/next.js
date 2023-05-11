import { join } from 'path'
import cheerio from 'cheerio'
import {
  nextBuild,
  renderViaHTTP,
  findPort,
  nextStart,
  killApp,
} from 'next-test-utils'

describe('Custom Document Fragment Styles', () => {
  const appDir = join(__dirname, '../')
  let appPort
  let app
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('correctly adds styles from fragment styles key', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)

    const styles = $('style').text()
    expect(styles).toMatch(/background:(.*|)hotpink/)
    expect(styles).toMatch(/font-size:(.*|)16\.4px/)
  })
})
