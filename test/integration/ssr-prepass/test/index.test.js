/* eslint-env jest */

import { join } from 'path'
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

describe('SSR Prepass', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should not externalize when used outside Next.js', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/hello.*?world/)
  })
})
