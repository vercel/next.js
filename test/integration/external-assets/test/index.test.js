/* eslint-env jest */
/* global jasmine */
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
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

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
