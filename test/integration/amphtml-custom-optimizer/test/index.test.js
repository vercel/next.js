/* eslint-env jest */

import { join } from 'path'
import {
  nextBuild,
  findPort,
  nextStart,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)

let app
let appPort
const appDir = join(__dirname, '../')

describe('AMP Custom Optimizer', () => {
  it('should build and start for static page', async () => {
    const { code } = await nextBuild(appDir, undefined)
    expect(code).toBe(0)

    appPort = await findPort()
    app = await nextStart(appDir, appPort)

    const html = await renderViaHTTP(appPort, '/')
    await killApp(app)

    expect(html).toContain(
      'amp-twitter width="500" height="500" layout="responsive" data-tweetid="1159145442896166912"'
    )
    expect(html).toContain('i-amphtml-version="001515617716922"')
    expect(html).toContain(
      'script async src="https://cdn.ampproject.org/rtv/001515617716922/v0.js"'
    )
  })

  it('should build and start for dynamic page', async () => {
    const { code } = await nextBuild(appDir, undefined)
    expect(code).toBe(0)

    appPort = await findPort()
    app = await nextStart(appDir, appPort)

    const html = await renderViaHTTP(appPort, '/dynamic')
    await killApp(app)

    expect(html).toContain(
      'amp-img width="500" height="500" layout="responsive" src="https://amp.dev/static/samples/img/story_dog2_portrait.jpg"'
    )
    expect(html).toContain('i-amphtml-version="001515617716922"')
    expect(html).toContain(
      'script async src="https://cdn.ampproject.org/rtv/001515617716922/v0.js"'
    )
  })
})
