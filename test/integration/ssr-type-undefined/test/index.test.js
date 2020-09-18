/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  nextBuild,
  launchApp,
  renderViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')
let appPort
let app

describe('SSR serialize undefined value', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await launchApp(appDir, appPort, { dev: true })
  })
  afterAll(() => killApp(app))

  it('should serialize undefined value', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/ValueIsUndefined/)
  })
})
