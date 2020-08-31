/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'

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
  it('should inline the google fonts for static pages', async () => {
    const html = await renderViaHTTP(appPort, '/index')
    expect(html).toContain(
      '<link rel="stylesheet" data-href="https://fonts.googleapis.com/css?family=Voces"/>'
    )
    expect(html).toMatch(
      /<style data-href="https:\/\/fonts\.googleapis\.com\/css\?family=Voces">.*<\/style>/
    )
  })
})
