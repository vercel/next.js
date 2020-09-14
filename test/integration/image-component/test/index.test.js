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

describe('SSR Images', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))
  it('should build successfully', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toContain('image component stub')
  })
})
