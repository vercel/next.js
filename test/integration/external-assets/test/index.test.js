/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let app
jest.setTimeout(1000 * 60 * 5)

describe('External Assets', () => {
  beforeAll(async () => {
    await nextBuild(appDir, [])
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should support Firebase', async () => {
    const html = await renderViaHTTP(appPort, '/about/history')
    expect(html).toMatch(/Hello Firebase: <!-- -->0/)
  })
})
