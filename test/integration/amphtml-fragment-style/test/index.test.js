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
const nodeArgs = ['-r', join(appDir, '../../lib/react-17-require-hook.js')]
let appPort
let app

describe('AMP Fragment Styles', () => {
  beforeAll(async () => {
    await nextBuild(appDir, [], {
      nodeArgs,
    })
    appPort = await findPort()
    app = await nextStart(appDir, appPort, {
      nodeArgs,
    })
  })
  afterAll(() => killApp(app))

  it('adds styles from fragment in AMP mode correctly', async () => {
    const html = await renderViaHTTP(appPort, '/', { amp: 1 })
    await validateAMP(html)
    const $ = cheerio.load(html)
    const styles = $('style[amp-custom]').text()
    expect(styles).toMatch(/background:(.*|)hotpink/)
    expect(styles).toMatch(/font-size:(.*|)16\.4px/)
  })
})
